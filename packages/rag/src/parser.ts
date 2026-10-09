// Document parsers. Each returns sections with the strongest source
// metadata the format actually provides — page numbers for PDF, headings
// and line ranges for Markdown/text, row ranges for CSV. Nothing is
// fabricated: formats without pages simply have no page field.
import { unzipSync, strFromU8 } from 'fflate';
import type { Section } from './chunker.js';
import { extensionOf } from '@novaops/shared';

export interface ParsedDocument { sections: Section[]; warnings: string[]; }

function linesSections(text: string, headingAware: boolean): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let heading: string | undefined;
  let buf: string[] = [];
  let start = 1;
  const flush = (endLine: number) => {
    const t = buf.join('\n').trim();
    if (t) sections.push({ text: t, heading, startLine: start, endLine: endLine });
    buf = [];
  };
  lines.forEach((line, i) => {
    const h = headingAware ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (h) {
      flush(i);
      heading = h[2].trim();
      start = i + 2;
    } else buf.push(line);
  });
  flush(lines.length);
  return sections;
}

export function parseText(text: string): ParsedDocument {
  return { sections: linesSections(text, false), warnings: [] };
}
export function parseMarkdown(text: string): ParsedDocument {
  return { sections: linesSections(text, true), warnings: [] };
}

export function parseCsv(text: string): ParsedDocument {
  const rows = text.split(/\r?\n/).filter((r) => r.length > 0);
  if (!rows.length) return { sections: [], warnings: ['CSV contained no rows'] };
  const header = rows[0];
  const sections: Section[] = [];
  const ROWS_PER_SECTION = 25;
  for (let i = 1; i < rows.length; i += ROWS_PER_SECTION) {
    const slice = rows.slice(i, i + ROWS_PER_SECTION);
    sections.push({
      text: `CSV rows with header: ${header}\n${slice.join('\n')}`,
      heading: `Rows ${i}-${i + slice.length - 1}`,
      startLine: i + 1, endLine: i + slice.length,
    });
  }
  return { sections, warnings: [] };
}

export function parseDocx(bytes: Uint8Array): ParsedDocument {
  const files = unzipSync(bytes);
  const xmlEntry = files['word/document.xml'];
  if (!xmlEntry) throw new Error('DOCX is missing word/document.xml');
  const xml = strFromU8(xmlEntry);
  const paragraphs = xml
    .split(/<w:p[ >]/)
    .map((p) => p.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = paragraphs.join('\n');
  return { sections: linesSections(text, false), warnings: ['DOCX headings and pages are not preserved by this parser'] };
}

export async function parsePdf(bytes: Uint8Array): Promise<ParsedDocument> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const sections: Section[] = [];
  const pages = Array.isArray(text) ? text : [text];
  pages.forEach((pageText, i) => {
    const t = (pageText ?? '').trim();
    if (!t) return;
    const lineCount = t.split('\n').length;
    sections.push({ text: t, page: i + 1, startLine: 1, endLine: lineCount });
  });
  return {
    sections,
    warnings: sections.length === 0 ? [`PDF had ${totalPages} pages but no extractable text (scanned PDFs need OCR, which V1 does not do)`] : [],
  };
}

export async function parseDocument(filename: string, bytes: Uint8Array, textFallback?: string): Promise<ParsedDocument> {
  const ext = extensionOf(filename);
  const text = textFallback ?? new TextDecoder().decode(bytes);
  switch (ext) {
    case 'md': case 'markdown': return parseMarkdown(text);
    case 'txt': return parseText(text);
    case 'csv': return parseCsv(text);
    case 'docx': return parseDocx(bytes);
    case 'pdf': return parsePdf(bytes);
    default: throw new Error(`Unsupported file type: .${ext || '(none)'}`);
  }
}
