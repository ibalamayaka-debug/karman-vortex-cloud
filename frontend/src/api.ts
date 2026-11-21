import type { KarmanCaseMeta, KarmanParams, KarmanResult, SimulateResponse } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function runKarmanSimulation(
  params: KarmanParams,
  force = false
): Promise<SimulateResponse> {
  const resp = await fetch(apiUrl('/api/simulate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, force }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error || `Cloud simulation failed (${resp.status})`);
  }
  return data as SimulateResponse;
}

export async function fetchCachedCases(): Promise<KarmanCaseMeta[]> {
  const resp = await fetch(apiUrl('/api/cases'));
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data?.cases || []) as KarmanCaseMeta[];
}

export async function fetchBundle(caseKey: string): Promise<KarmanResult> {
  const resp = await fetch(apiUrl(`/api/bundle/${caseKey}`));
  if (!resp.ok) {
    throw new Error(`Failed loading bundle ${caseKey} (${resp.status})`);
  }
  return (await resp.json()) as KarmanResult;
}
