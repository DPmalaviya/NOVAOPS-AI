// Structure-aware recursive chunker.
// Strategy: split into sections (markdown headings / pages / paragraphs),
// then pack sentences into chunks up to a token budget with overlap.
// Token count is estimated as chars/4, the standard rough heuristic for
// English text; the estimate is only used for sizing, never reported as
// a provider token count.

export interface ChunkConfig { maxTokens: number; overlapTokens: number; }
export const CHUNK_PRESETS: Record<string, ChunkConfig> = {
  small: { maxTokens: 250, overlapTokens: 25 },
  medium: { maxTokens: 500, overlapTokens: 50 },
  large: { maxTokens: 800, overlapTokens: 80 },
};

export interface Section {
  text: string;
  heading?: string;
  page?: number;
  startLine: number;
  endLine: number;
}

export interface DraftChunk {
  index: number;
  text: string;
  heading?: string;
  page?: number;
  startLine: number;
  endLine: number;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+\n/g) ?? [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

export function chunkSections(sections: Section[], cfg: ChunkConfig): DraftChunk[] {
  const maxChars = cfg.maxTokens * 4;
  const overlapChars = cfg.overlapTokens * 4;
  const out: DraftChunk[] = [];
  for (const sec of sections) {
    const sentences = splitSentences(sec.text);
    let cur = '';
    let curStart = sec.startLine;
    const linesApprox = sec.text.split('\n').length;
    const lineFor = (frac: number) => sec.startLine + Math.floor(frac * Math.max(0, linesApprox - 1));
    let consumed = 0;
    const flush = (endFrac: number) => {
      const text = cur.trim();
      if (!text) return;
      out.push({ index: out.length, text, heading: sec.heading, page: sec.page, startLine: curStart, endLine: lineFor(endFrac) });
    };
    sentences.forEach((s, i) => {
      const frac = sentences.length ? i / sentences.length : 0;
      if (cur && cur.length + s.length + 1 > maxChars) {
        flush(frac);
        const tail = overlapChars > 0 ? cur.slice(-overlapChars) : '';
        curStart = lineFor(frac);
        cur = tail ? `${tail} ${s}` : s;
      } else {
        if (!cur) curStart = lineFor(frac);
        cur = cur ? `${cur} ${s}` : s;
      }
      consumed = i;
    });
    void consumed;
    flush(1);
    void sec.endLine;
  }
  return out.map((c, i) => ({ ...c, index: i }));
}
