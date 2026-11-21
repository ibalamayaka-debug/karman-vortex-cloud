/**
 * Cloudflare Worker Edge Gateway for Karman Vortex Street Cloud ($0/month).
 *
 * - Deterministic SHA-256 cache key per (shape, reynolds, angle_deg)
 * - Instant 0ms hit from Cloudflare KV (KARMAN_KV)
 * - Dispatches cache misses to Modal Cloud OpenFOAM v2512 transient `icoFoam`
 * - Per-IP rate limiting via RATE_LIMIT_KV (shared or dedicated)
 */

export interface Env {
  KARMAN_KV: KVNamespace;
  RATE_LIMIT_KV?: KVNamespace;
  COMPUTE_ENDPOINT_URL?: string;
  COMPUTE_AUTH_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
  MAX_RUNS_PER_IP_PER_HOUR?: string;
}

const VALID_SHAPES = new Set(["cylinder", "bolte", "westgate", "eureka"]);

interface NormalizedParams {
  shape: string;
  reynolds: number;
  angle_deg: number;
  wind_speed_ms: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function normalizeParams(raw: Record<string, unknown>): NormalizedParams {
  const shape = typeof raw.shape === "string" && VALID_SHAPES.has(raw.shape) ? raw.shape : "cylinder";
  const reynolds = Math.round(clamp(Number(raw.reynolds ?? 150), 60, 280) / 10) * 10;
  let angle_deg = Math.round(clamp(Number(raw.angle_deg ?? 0), -15, 15) / 3) * 3;
  if (shape === "cylinder") angle_deg = 0;
  const wind_speed_ms = Number(clamp(Number(raw.wind_speed_ms ?? 12), 2, 40).toFixed(1));
  return { shape, reynolds, angle_deg, wind_speed_ms };
}

async function computeCaseKey(p: NormalizedParams): Promise<string> {
  const canonical = `shape=${p.shape}|re=${p.reynolds.toFixed(0)}|ang=${p.angle_deg.toFixed(0)}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const configured = env.ALLOWED_ORIGIN || "*";
  let allow = configured;
  if (configured !== "*" && origin) {
    const list = configured.split(",").map((s) => s.trim());
    allow = list.includes(origin) ? origin : list[0];
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResp(data: unknown, env: Env, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env, origin),
    },
  });
}

async function checkRateLimit(ip: string, env: Env): Promise<{ allowed: boolean; remaining: number }> {
  const limit = Number(env.MAX_RUNS_PER_IP_PER_HOUR || "10");
  if (!env.RATE_LIMIT_KV || limit <= 0) {
    return { allowed: true, remaining: limit };
  }
  const bucket = Math.floor(Date.now() / 3_600_000);
  const key = `karman_rl:${ip}:${bucket}`;
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || "0");
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 3700 });
  return { allowed: true, remaining: limit - current - 1 };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    if (request.method === "GET" && path === "/api/health") {
      return jsonResp(
        {
          status: "ok",
          service: "karman-vortex-cloud",
          compute_configured: Boolean(env.COMPUTE_ENDPOINT_URL),
        },
        env,
        origin
      );
    }

    // List all cached simulation metadata
    if (request.method === "GET" && path === "/api/cases") {
      const listed = await env.KARMAN_KV.list({ prefix: "meta:", limit: 50 });
      const items = await Promise.all(
        listed.keys.map(async (k) => {
          const txt = await env.KARMAN_KV.get(k.name, "text");
          if (!txt) return null;
          try {
            return JSON.parse(txt);
          } catch {
            return null;
          }
        })
      );
      return jsonResp({ cases: items.filter(Boolean) }, env, origin);
    }

    // Fetch full 48-frame animation bundle for a case_key
    if (request.method === "GET" && path.startsWith("/api/bundle/")) {
      const caseKey = path.slice("/api/bundle/".length);
      if (!/^[a-f0-9]{16}$/.test(caseKey)) {
        return jsonResp({ error: "Invalid case key" }, env, origin, 400);
      }
      const txt = await env.KARMAN_KV.get(`bundle:${caseKey}`, "text");
      if (!txt) {
        return jsonResp({ error: "Case not found in KV" }, env, origin, 404);
      }
      return new Response(txt, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
          ...corsHeaders(env, origin),
        },
      });
    }

    // Trigger or fetch transient OpenFOAM Karman vortex street simulation
    if (request.method === "POST" && path === "/api/simulate") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResp({ error: "Invalid JSON payload" }, env, origin, 400);
      }

      const params = normalizeParams(body);
      const caseKey = await computeCaseKey(params);
      const force = Boolean(body.force);

      if (!force) {
        const cachedBundle = await env.KARMAN_KV.get(`bundle:${caseKey}`, "text");
        if (cachedBundle) {
          return jsonResp(
            {
              status: "ok",
              cached: true,
              backend: "cloudflare-kv-cache",
              case_key: caseKey,
              result: JSON.parse(cachedBundle),
            },
            env,
            origin
          );
        }
      }

      const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
      const rate = await checkRateLimit(clientIp, env);
      if (!rate.allowed) {
        return jsonResp(
          { error: "Hourly cloud compute quota reached for this IP. Try cached presets below!" },
          env,
          origin,
          429
        );
      }

      if (!env.COMPUTE_ENDPOINT_URL) {
        return jsonResp({ error: "COMPUTE_ENDPOINT_URL not configured" }, env, origin, 503);
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (env.COMPUTE_AUTH_TOKEN) {
        headers["Authorization"] = `Bearer ${env.COMPUTE_AUTH_TOKEN}`;
      }

      const resp = await fetch(env.COMPUTE_ENDPOINT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
      });

      if (!resp.ok) {
        const detail = await resp.text();
        return jsonResp(
          { error: `Cloud OpenFOAM failed (${resp.status}): ${detail.slice(0, 400)}` },
          env,
          origin,
          502
        );
      }

      const data = (await resp.json()) as { result: Record<string, unknown> };
      const result = data.result;

      // Save full bundle + lightweight metadata summary in Cloudflare KV
      const meta = {
        case_key: caseKey,
        params: result.params,
        kpis: {
          strouhal: (result.kpis as Record<string, unknown>)?.strouhal,
          cd_mean: (result.kpis as Record<string, unknown>)?.cd_mean,
          cl_rms: (result.kpis as Record<string, unknown>)?.cl_rms,
          n_cells: (result.kpis as Record<string, unknown>)?.n_cells,
          n_frames: (result.kpis as Record<string, unknown>)?.n_frames,
        },
        timing_sec: result.timing_sec,
        payload_kb: result.payload_kb,
        computed_at: result.computed_at,
      };

      await Promise.all([
        env.KARMAN_KV.put(`bundle:${caseKey}`, JSON.stringify(result)),
        env.KARMAN_KV.put(`meta:${caseKey}`, JSON.stringify(meta)),
      ]);

      return jsonResp(
        {
          status: "ok",
          cached: false,
          backend: "modal-openfoam-icofoam",
          case_key: caseKey,
          remaining_quota: rate.remaining,
          result,
        },
        env,
        origin
      );
    }

    return jsonResp({ error: "Not found" }, env, origin, 404);
  },
};
