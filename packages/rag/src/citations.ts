// Citation extraction and verification: markers in the answer ([S1], [S2])
// are mapped back to the exact evidence chunks used in the prompt. A
// citation is only emitted if its marker was actually in the prompt.
import type { Citation, Evidence } from '@novaops/shared';

export function extractCitations(answer: string, evidence: Evidence[]): Citation[] {
  const found = new Set<string>();
  for (const m of answer.matchAll(/\[S(\d+)\]/g)) found.add(m[1]);
  const citations: Citation[] = [];
  for (const n of [...found].sort((a, b) => Number(a) - Number(b))) {
    const ev = evidence[Number(n) - 1];
    if (!ev) continue; // hallucinated marker: not a real citation, drop it
    citations.push({
      marker: `S${n}`, chunkId: ev.chunkId, documentId: ev.documentId, filename: ev.filename,
      heading: ev.heading, page: ev.page, startLine: ev.startLine, endLine: ev.endLine,
    });
  }
  return citations;
}

export function stripUnverifiedMarkers(answer: string, evidenceCount: number): string {
  return answer.replace(/\[S(\d+)\]/g, (full, n) => (Number(n) >= 1 && Number(n) <= evidenceCount ? full : ''));
}
