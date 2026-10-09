// SHA-256 via WebCrypto (available in Node >=19 and Cloudflare Workers).
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function chunkIdFor(documentId: string, index: number): string {
  return `${documentId}#${index}`;
}
