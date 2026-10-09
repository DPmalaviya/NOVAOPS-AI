export type ChunkSource = { documentId: string; sourceLabel: string; text: string; heading?: string; lineStart?: number }
export type Chunk = { id: string; documentId: string; sourceLabel: string; chunkIndex: number; text: string; heading?: string; lineStart?: number; lineEnd?: number }

/** Deterministic, paragraph-first chunker. Token estimation is deliberately conservative until Stage 7 calibration. */
export function chunkText(source: ChunkSource, targetChars = 1100, overlapChars = 160): Chunk[] {
  if (targetChars < 200 || overlapChars < 0 || overlapChars >= targetChars) throw new Error('Invalid chunk configuration')
  const normalized = source.text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const paragraphs = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const chunks: Chunk[] = []; let buffer = ''; let startLine = source.lineStart ?? 1
  const emit = () => { const text = buffer.trim(); if (!text) return; const index = chunks.length; chunks.push({ id: `${source.documentId}-${String(index).padStart(4,'0')}`, documentId: source.documentId, sourceLabel: source.sourceLabel, chunkIndex: index, text, heading: source.heading, lineStart: startLine, lineEnd: startLine + text.split('\n').length - 1 }); const tail = overlapChars === 0 ? '' : text.slice(-overlapChars); startLine += Math.max(1, text.split('\n').length - tail.split('\n').length); buffer = tail }
  for (const paragraph of paragraphs) { const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph; if (candidate.length > targetChars && buffer.trim()) emit(); buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph; while (buffer.length > targetChars) { const cut = buffer.lastIndexOf(' ', targetChars); const safeCut = cut > targetChars * .6 ? cut : targetChars; const head = buffer.slice(0, safeCut); const rest = buffer.slice(safeCut).trim(); buffer = head; emit(); buffer = `${buffer}\n\n${rest}` } }
  emit(); return chunks
}
