import React, { useEffect, useMemo, useRef, useState } from 'react';
import { unzlibSync } from 'fflate';
import { Pause, Play } from 'lucide-react';
import { TRANSLATIONS, type Lang } from '../i18n';
import type { FieldMode, KarmanResult, PaletteMode } from '../types';

interface VortexCanvasProps {
  lang: Lang;
  result: KarmanResult | null;
  field: FieldMode;
  palette: PaletteMode;
  showBrushstrokes: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  loading: boolean;
}

interface DecodedFrames {
  nx: number;
  ny: number;
  vxSub: number;
  vySub: number;
  nFrames: number;
  mask: Uint8Array;
  vort: Uint8Array;
  speed: Uint8Array;
  uxSub: Uint8Array;
  uySub: Uint8Array;
  velClip: number;
}

type RGB = [number, number, number];

const PALETTE_STOPS: Record<PaletteMode, Array<[number, RGB]>> = {
  // Van Gogh "Starry Night": deep cobalt/indigo sky, luminous cerulean swirls, golden ochre & lemon starlight vortices
  starry: [
    [0.0, [110, 215, 255]],
    [0.18, [37, 115, 235]],
    [0.36, [22, 42, 112]],
    [0.5, [18, 22, 46]],
    [0.64, [112, 48, 24]],
    [0.82, [234, 140, 22]],
    [1.0, [254, 240, 138]],
  ],
  // Warm Espresso & Golden Ember
  ember: [
    [0.0, [253, 164, 175]],
    [0.2, [225, 29, 72]],
    [0.38, [98, 24, 38]],
    [0.5, [28, 20, 16]],
    [0.64, [120, 53, 15]],
    [0.82, [245, 158, 11]],
    [1.0, [254, 243, 199]],
  ],
  // ParaView Cool-to-Warm Bipolar
  scientific: [
    [0.0, [30, 64, 175]],
    [0.25, [96, 165, 250]],
    [0.5, [232, 228, 222]],
    [0.75, [248, 113, 113]],
    [1.0, [185, 28, 28]],
  ],
  // Inferno Plasma
  inferno: [
    [0.0, [14, 10, 28]],
    [0.25, [98, 24, 116]],
    [0.5, [196, 62, 74]],
    [0.78, [249, 148, 28]],
    [1.0, [252, 251, 178]],
  ],
};

function buildLut(mode: PaletteMode): Uint8ClampedArray {
  const stops = PALETTE_STOPS[mode];
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k][0] && t <= stops[k + 1][0]) {
        s0 = stops[k];
        s1 = stops[k + 1];
        break;
      }
    }
    const span = Math.max(s1[0] - s0[0], 1e-6);
    const f = (t - s0[0]) / span;
    lut[i * 4 + 0] = Math.round(s0[1][0] + (s1[1][0] - s0[1][0]) * f);
    lut[i * 4 + 1] = Math.round(s0[1][1] + (s1[1][1] - s0[1][1]) * f);
    lut[i * 4 + 2] = Math.round(s0[1][2] + (s1[1][2] - s0[1][2]) * f);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

function lutGradientCss(mode: PaletteMode): string {
  const stops = PALETTE_STOPS[mode]
    .map(([pos, [r, g, b]]) => `rgb(${r},${g},${b}) ${Math.round(pos * 100)}%`)
    .join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

function decodeResultFrames(result: KarmanResult): DecodedFrames {
  const binStr = atob(result.frames_zlib_b64);
  const comp = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) comp[i] = binStr.charCodeAt(i);
  const raw = unzlibSync(comp);

  const { nx, ny, vx_sub: vxSub, vy_sub: vySub, n_frames: nFrames, vel_clip: velClip } = result.grid;
  const fullPlane = nx * ny;
  const subPlane = vxSub * vySub;

  let offset = 0;
  const mask = raw.subarray(offset, offset + fullPlane);
  offset += fullPlane;
  const vort = raw.subarray(offset, offset + nFrames * fullPlane);
  offset += nFrames * fullPlane;
  const speed = raw.subarray(offset, offset + nFrames * fullPlane);
  offset += nFrames * fullPlane;
  const uxSub = raw.subarray(offset, offset + nFrames * subPlane);
  offset += nFrames * subPlane;
  const uySub = raw.subarray(offset, offset + nFrames * subPlane);

  return { nx, ny, vxSub, vySub, nFrames, mask, vort, speed, uxSub, uySub, velClip };
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  trailX: Float32Array;
  trailY: Float32Array;
  trailLen: number;
}

const TRAIL_STEPS = 7;
const N_PARTICLES = 1350;

function spawnParticle(p: Particle, nx: number, ny: number, randomX = true) {
  p.x = randomX ? Math.random() * nx : Math.random() * (nx * 0.14);
  p.y = (0.06 + Math.random() * 0.88) * ny;
  p.age = 0;
  p.maxAge = 45 + Math.random() * 95;
  p.trailLen = 1;
  p.trailX[0] = p.x;
  p.trailY[0] = p.y;
}

export const VortexCanvas: React.FC<VortexCanvasProps> = ({
  lang,
  result,
  field,
  palette,
  showBrushstrokes,
  playing,
  onTogglePlay,
  playbackSpeed,
  loading,
}) => {
  const t = TRANSLATIONS[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameFloatRef = useRef<number>(0);
  const [frameIdxUi, setFrameIdxUi] = useState<number>(0);

  const decoded = useMemo(() => {
    if (!result) return null;
    try {
      return decodeResultFrames(result);
    } catch (e) {
      console.error('Failed to decode Karman frames:', e);
      return null;
    }
  }, [result]);

  const lut = useMemo(() => buildLut(palette), [palette]);

  // Keep live settings in refs so the 60 FPS rAF loop never restarts on slider changes
  const cfgRef = useRef({ field, palette, showBrushstrokes, playing, playbackSpeed, lut });
  cfgRef.current = { field, palette, showBrushstrokes, playing, playbackSpeed, lut };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded || !result) return;

    const { nx, ny, vxSub, vySub, nFrames, mask, vort, speed, uxSub, uySub, velClip } = decoded;
    const fullPlane = nx * ny;
    const subPlane = vxSub * vySub;

    // Offscreen low-res ImageData buffer upscaled smoothly onto the hi-DPI display canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = nx;
    offscreen.height = ny;
    const offCtx = offscreen.getContext('2d')!;
    const imgData = offCtx.createImageData(nx, ny);
    const pixels = imgData.data;

    // Initialize Van Gogh Starry Night glowing particles
    const particles: Particle[] = Array.from({ length: N_PARTICLES }, () => {
      const p: Particle = {
        x: 0,
        y: 0,
        age: 0,
        maxAge: 80,
        trailX: new Float32Array(TRAIL_STEPS),
        trailY: new Float32Array(TRAIL_STEPS),
        trailLen: 1,
      };
      spawnParticle(p, nx, ny, true);
      return p;
    });

    const sampleVel = (
      px: number,
      py: number,
      fA: number,
      fB: number,
      frac: number
    ): [number, number] => {
      const sx = Math.min(Math.max(px * 0.5, 0), vxSub - 1.001);
      const sy = Math.min(Math.max(py * 0.5, 0), vySub - 1.001);
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;
      const i00 = iy * vxSub + ix;
      const i10 = i00 + 1;
      const i01 = i00 + vxSub;
      const i11 = i01 + 1;

      const baseA = fA * subPlane;
      const baseB = fB * subPlane;

      const interp = (arr: Uint8Array) => {
        const a =
          (arr[baseA + i00] * (1 - fx) + arr[baseA + i10] * fx) * (1 - fy) +
          (arr[baseA + i01] * (1 - fx) + arr[baseA + i11] * fx) * fy;
        const b =
          (arr[baseB + i00] * (1 - fx) + arr[baseB + i10] * fx) * (1 - fy) +
          (arr[baseB + i01] * (1 - fx) + arr[baseB + i11] * fx) * fy;
        return ((a + (b - a) * frac) - 127.5) / 127.0 * velClip;
      };
      return [interp(uxSub), interp(uySub)];
    };

    let rafId = 0;
    let lastTs = performance.now();
    let uiTick = 0;

    const renderFrame = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      const cfg = cfgRef.current;

      if (cfg.playing) {
        // Native OpenFOAM frame rate ~10 fps -> interpolated smoothly at 60 FPS
        frameFloatRef.current = (frameFloatRef.current + dt * 11.5 * cfg.playbackSpeed) % nFrames;
      }
      const fFloat = frameFloatRef.current;
      const fA = Math.floor(fFloat) % nFrames;
      const fB = (fA + 1) % nFrames;
      const frac = fFloat - Math.floor(fFloat);

      if (++uiTick % 4 === 0) {
        setFrameIdxUi(fA);
      }

      // 1. Render interpolated vorticity or speed field into offscreen ImageData
      const srcArr = cfg.field === 'vorticity' ? vort : speed;
      const baseA = fA * fullPlane;
      const baseB = fB * fullPlane;
      const curLut = cfg.lut;

      for (let iy = 0; iy < ny; iy++) {
        // Flip Y so +y points UP on canvas
        const dstRow = (ny - 1 - iy) * nx;
        const srcRow = iy * nx;
        for (let ix = 0; ix < nx; ix++) {
          const cellIdx = srcRow + ix;
          const pOff = (dstRow + ix) * 4;
          if (mask[cellIdx] === 1) {
            // Warm architectural charcoal obstacle body
            pixels[pOff + 0] = 36;
            pixels[pOff + 1] = 28;
            pixels[pOff + 2] = 23;
            pixels[pOff + 3] = 255;
          } else {
            const vA = srcArr[baseA + cellIdx];
            const vB = srcArr[baseB + cellIdx];
            const val = (vA + (vB - vA) * frac) | 0;
            const lOff = val * 4;
            pixels[pOff + 0] = curLut[lOff + 0];
            pixels[pOff + 1] = curLut[lOff + 1];
            pixels[pOff + 2] = curLut[lOff + 2];
            pixels[pOff + 3] = 255;
          }
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      // 2. Resize display canvas cleanly to match container
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.floor(rect.width * dpr));
      const ch = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }

      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen, 0, 0, cw, ch);

      const scaleX = cw / nx;
      const scaleY = ch / ny;

      // 3. Advect & paint 1,350 luminous Van Gogh Starry Night brushstroke trails!
      if (cfg.showBrushstrokes) {
        const advStep = (cfg.playing ? dt * 15.0 * cfg.playbackSpeed : 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (advStep > 0) {
            const [u1, v1] = sampleVel(p.x, p.y, fA, fB, frac);
            const mx = p.x + 0.5 * u1 * advStep;
            const my = p.y + 0.5 * v1 * advStep;
            const [u2, v2] = sampleVel(mx, my, fA, fB, frac);
            p.x += u2 * advStep;
            p.y += v2 * advStep;
            p.age += 1;

            const gx = Math.floor(p.x);
            const gy = Math.floor(p.y);
            const hitSolid =
              gx >= 0 && gx < nx && gy >= 0 && gy < ny && mask[gy * nx + gx] === 1;

            if (p.x < 0 || p.x >= nx - 1 || p.y <= 1 || p.y >= ny - 2 || hitSolid || p.age > p.maxAge) {
              spawnParticle(p, nx, ny, false);
              continue;
            }

            // Shift trail ring
            const newLen = Math.min(p.trailLen + 1, TRAIL_STEPS);
            for (let k = newLen - 1; k > 0; k--) {
              p.trailX[k] = p.trailX[k - 1];
              p.trailY[k] = p.trailY[k - 1];
            }
            p.trailX[0] = p.x;
            p.trailY[0] = p.y;
            p.trailLen = newLen;
          }

          if (p.trailLen < 2) continue;

          // Color brushstroke subtly by local vorticity for Van Gogh swirling glow
          const gx = Math.min(Math.max(Math.floor(p.x), 0), nx - 1);
          const gy = Math.min(Math.max(Math.floor(p.y), 0), ny - 1);
          const wVal = vort[baseA + gy * nx + gx];
          const swirlStrength = Math.abs(wVal - 127.5) / 127.5;
          const lifeFade = Math.sin((p.age / p.maxAge) * Math.PI);
          const alpha = Math.min(0.85, (0.22 + swirlStrength * 0.68) * Math.max(lifeFade, 0.2));

          ctx.beginPath();
          ctx.moveTo(p.trailX[0] * scaleX, (ny - p.trailY[0]) * scaleY);
          for (let k = 1; k < p.trailLen; k++) {
            ctx.lineTo(p.trailX[k] * scaleX, (ny - p.trailY[k]) * scaleY);
          }

          if (cfg.palette === 'starry') {
            ctx.strokeStyle =
              wVal >= 128
                ? `rgba(254, 240, 138, ${alpha.toFixed(2)})`
                : `rgba(147, 219, 255, ${alpha.toFixed(2)})`;
          } else {
            ctx.strokeStyle = `rgba(255, 244, 224, ${alpha.toFixed(2)})`;
          }
          ctx.lineWidth = (1.1 + swirlStrength * 2.1) * dpr;
          ctx.stroke();
        }
      }

      // 4. Crisp architectural outline around the solid obstacle
      ctx.save();
      const { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax } = result.grid;
      const toPxX = (wx: number) => ((wx - xMin) / (xMax - xMin)) * cw;
      const toPxY = (wy: number) => ((yMax - wy) / (yMax - yMin)) * ch;
      const unitX = cw / (xMax - xMin);
      const unitY = ch / (yMax - yMin);

      ctx.translate(toPxX(0), toPxY(0));
      ctx.rotate((-result.params.angle_deg * Math.PI) / 180);
      ctx.fillStyle = '#251c16';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.0 * dpr;

      const shape = result.params.shape;
      if (shape === 'cylinder') {
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.5 * unitX, 0.5 * unitY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (shape === 'eureka') {
        const s = 0.5;
        const c = 0.34;
        const pts = [
          [-c, -s], [c, -s], [s, -c], [s, c],
          [c, s], [-c, s], [-s, c], [-s, -c],
        ];
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px * unitX, -py * unitY) : ctx.lineTo(px * unitX, -py * unitY)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (shape === 'westgate') {
        const pts = [
          [-1.1, 0], [-0.82, 0.36], [0.82, 0.36],
          [1.1, 0], [0.82, -0.36], [-0.82, -0.36],
        ];
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px * unitX, -py * unitY) : ctx.lineTo(px * unitX, -py * unitY)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (shape === 'bolte') {
        for (const cx of [-0.52, 0.52]) {
          ctx.beginPath();
          ctx.rect((cx - 0.24) * unitX, -0.68 * unitY, 0.48 * unitX, 1.36 * unitY);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();

      // 5. Update bottom live CL(t) oscillation sparkline playhead
      const waveCanvas = waveCanvasRef.current;
      if (waveCanvas && result.kpis.series_cl.length > 2) {
        const wRect = waveCanvas.getBoundingClientRect();
        const ww = Math.max(1, Math.floor(wRect.width * dpr));
        const wh = Math.max(1, Math.floor(wRect.height * dpr));
        if (waveCanvas.width !== ww || waveCanvas.height !== wh) {
          waveCanvas.width = ww;
          waveCanvas.height = wh;
        }
        const wCtx = waveCanvas.getContext('2d')!;
        wCtx.clearRect(0, 0, ww, wh);

        // Zero centerline
        wCtx.strokeStyle = 'rgba(251, 191, 128, 0.2)';
        wCtx.lineWidth = 1 * dpr;
        wCtx.beginPath();
        wCtx.moveTo(0, wh * 0.5);
        wCtx.lineTo(ww, wh * 0.5);
        wCtx.stroke();

        const clArr = result.kpis.series_cl;
        const maxAbs = Math.max(0.15, ...clArr.map((v) => Math.abs(v))) * 1.18;

        wCtx.strokeStyle = '#fbbf24';
        wCtx.lineWidth = 2 * dpr;
        wCtx.beginPath();
        for (let k = 0; k < clArr.length; k++) {
          const x = (k / (clArr.length - 1)) * ww;
          const y = wh * 0.5 - (clArr[k] / maxAbs) * (wh * 0.42);
          if (k === 0) wCtx.moveTo(x, y);
          else wCtx.lineTo(x, y);
        }
        wCtx.stroke();

        // Synced moving playhead dot
        const prog = fFloat / nFrames;
        const px = prog * ww;
        const idxCl = Math.min(clArr.length - 1, Math.floor(prog * clArr.length));
        const py = wh * 0.5 - (clArr[idxCl] / maxAbs) * (wh * 0.42);
        wCtx.strokeStyle = 'rgba(249, 115, 22, 0.7)';
        wCtx.lineWidth = 1.5 * dpr;
        wCtx.beginPath();
        wCtx.moveTo(px, 0);
        wCtx.lineTo(px, wh);
        wCtx.stroke();

        wCtx.fillStyle = '#fef08a';
        wCtx.beginPath();
        wCtx.arc(px, py, 4.2 * dpr, 0, Math.PI * 2);
        wCtx.fill();
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [decoded, result]);

  const totalFrames = result?.grid.n_frames ?? 48;
  const vortClip = result?.grid.vort_clip ?? 3.0;
  const speedMax = result?.grid.speed_max ?? 1.5;

  return (
    <div className="stage-shell">
      <div className="canvas-box">
        <canvas ref={canvasRef} className="vortex-canvas" />

        {/* Floating playback + frame scrubber bar */}
        {result && (
          <div className="playback-bar">
            <button type="button" className="play-btn" onClick={onTogglePlay}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              <span>{playing ? t.pause : t.play}</span>
            </button>
            <input
              type="range"
              min={0}
              max={totalFrames - 1}
              step={1}
              value={frameIdxUi}
              onChange={(e) => {
                const v = Number(e.target.value);
                frameFloatRef.current = v;
                setFrameIdxUi(v);
              }}
            />
            <span className="frame-counter">
              t = {(result.grid.frame_times[frameIdxUi] ?? 0).toFixed(1)}s ({frameIdxUi + 1}/{totalFrames})
            </span>
          </div>
        )}

        {/* Colorbar Legend */}
        {result && (
          <div className="colorbar-card">
            <div className="colorbar-header">
              <span>{field === 'vorticity' ? t.colorbarVort : t.colorbarSpeed}</span>
            </div>
            <div className="colorbar-strip" style={{ background: lutGradientCss(palette) }} />
            <div className="colorbar-ticks">
              <span>{field === 'vorticity' ? `-${vortClip.toFixed(1)}` : '0.0'}</span>
              <span>{field === 'vorticity' ? '0.0' : (speedMax * 0.5).toFixed(2)}</span>
              <span>{field === 'vorticity' ? `+${vortClip.toFixed(1)}` : speedMax.toFixed(2)}</span>
            </div>
          </div>
        )}

        {(loading || !result) && (
          <div className="canvas-overlay">
            {loading ? (
              <div className="spinner-card">
                <div className="spinner" />
                <h3>{t.loadingTitle}</h3>
                <p>{t.loadingDesc}</p>
              </div>
            ) : (
              <div className="spinner-card">
                <h3>{t.emptyTitle}</h3>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Synced Lift Oscillation Waveform Strip */}
      {result && result.kpis.series_cl.length > 2 && (
        <div className="wave-strip">
          <span className="wave-label">{t.waveTitle}</span>
          <canvas ref={waveCanvasRef} className="wave-canvas" />
        </div>
      )}
    </div>
  );
};
