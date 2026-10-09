// Thin API client. Every value shown in the UI comes from these calls;
// there is no demo data anywhere in the frontend.
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

function sessionId(): string {
  let id = localStorage.getItem('novaops-session');
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('novaops-session', id); }
  return id;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId(), ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed (HTTP ${res.status})`);
  return data as T;
}

export interface EvidenceItem { chunkId: string; documentId: string; filename: string; text: string; score: number; heading?: string; page?: number; startLine?: number; endLine?: number; }
export interface QueryResult {
  question: string; answer: string | null; retrievalOnly: boolean; insufficientEvidence: boolean;
  provider: string | null; model: string | null;
  citations: { marker: string; filename: string; heading?: string; page?: number; startLine?: number; endLine?: number }[];
  citationsVerified: boolean; evidence: EvidenceItem[];
  attempts: { provider: string; model: string; ok: boolean; latencyMs: number; errorCategory?: string }[];
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
  steps?: { id: string; label: string; detail: string; status: string }[];
  chunksSearched?: number;
}
export interface DocRecord { id: string; filename: string; source: string; sourceRef?: string; sizeBytes: number; state: string; error?: string; chunkCount: number; indexedAt?: string; createdAt: string; }

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
