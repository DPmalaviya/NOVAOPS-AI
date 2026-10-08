import { APP_VERSION, type HealthResponse } from '@novaops/shared'
import { chunkText, SAMPLE_DOCUMENT } from '@novaops/rag'

const EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b'
const EMBEDDING_DIMENSIONS = 1024
const NAMESPACE = 'sample'

export interface Env { DB: D1Database; VECTOR: VectorizeIndex; AI: Ai }
type EmbeddingResponse = { data?: number[][] | number[]; shape?: number[] }
type Citation = { chunkId: string; documentId: string; source: string; chunkIndex: number; excerpt: string; score: number }

const headers = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }
const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers })
const error = (code: string, message: string, status: number) => json({ code, message }, { status })

function extractVector(response: EmbeddingResponse): number[] | null {
  const raw = response.data
  if (!Array.isArray(raw)) return null
  const candidate = Array.isArray(raw[0]) ? raw[0] : raw
  if (!candidate.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
  return candidate.length === EMBEDDING_DIMENSIONS ? candidate as number[] : null
}

async function embed(env: Env, text: string): Promise<number[]> {
  const result = await env.AI.run(EMBEDDING_MODEL, { text }) as EmbeddingResponse
  const vector = extractVector(result)
  if (!vector) throw new Error('Embedding response has an unexpected shape.')
  return vector
}

async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function indexSample(env: Env): Promise<Response> {
  const docHash = await hashText(SAMPLE_DOCUMENT.content)
  const chunks = chunkText({ documentId: SAMPLE_DOCUMENT.id, sourceLabel: SAMPLE_DOCUMENT.filename, text: SAMPLE_DOCUMENT.content }, 1100, 120)
  if (!chunks.length) return error('EMPTY_DOCUMENT', 'The sample source contains no indexable text.', 422)
  const old = await env.DB.prepare('SELECT content_hash, status FROM documents WHERE id = ? AND namespace = ?').bind(SAMPLE_DOCUMENT.id, NAMESPACE).first<{ content_hash: string; status: string }>()
  if (old?.content_hash === docHash && old.status === 'ready') return json({ status: 'unchanged', documentId: SAMPLE_DOCUMENT.id, indexedChunks: 0, skippedChunks: chunks.length, embeddingModel: EMBEDDING_MODEL })
  const previous = await env.DB.prepare('SELECT id FROM chunks WHERE document_id = ? AND namespace = ?').bind(SAMPLE_DOCUMENT.id, NAMESPACE).all<{ id: string }>()
  const nextIds = new Set(chunks.map((chunk) => chunk.id))
  const staleIds = (previous.results ?? []).map((row) => row.id).filter((id) => !nextIds.has(id))

  try {
    const vectors = await Promise.all(chunks.map(async (chunk) => ({
      id: chunk.id,
      values: await embed(env, chunk.text),
      metadata: { namespace: NAMESPACE, documentId: chunk.documentId, sourceLabel: chunk.sourceLabel, chunkIndex: chunk.chunkIndex },
    })))
    await env.VECTOR.upsert(vectors)
    if (staleIds.length) await env.VECTOR.deleteByIds(staleIds)
    const now = new Date().toISOString()
    // Hash each chunk before binding it; do so without ever logging source text.
    const chunkHashes = await Promise.all(chunks.map((chunk) => hashText(chunk.text)))
    const documentStatement = env.DB.prepare('INSERT OR REPLACE INTO documents (id, namespace, filename, source_type, content_hash, status, created_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(SAMPLE_DOCUMENT.id, NAMESPACE, SAMPLE_DOCUMENT.filename, SAMPLE_DOCUMENT.sourceType, docHash, 'ready', now, now)
    const chunkStatements = chunks.map((chunk, index) => env.DB.prepare('INSERT OR REPLACE INTO chunks (id, document_id, namespace, chunk_index, text, source_label, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(chunk.id, chunk.documentId, NAMESPACE, chunk.chunkIndex, chunk.text, chunk.sourceLabel, chunkHashes[index], now))
    const staleDelete = staleIds.length ? env.DB.prepare(`DELETE FROM chunks WHERE namespace = ? AND document_id = ? AND id IN (${staleIds.map(() => '?').join(',')})`).bind(NAMESPACE, SAMPLE_DOCUMENT.id, ...staleIds) : null
    await env.DB.batch([documentStatement, ...chunkStatements, ...(staleDelete ? [staleDelete] : [])])
    return json({ status: 'indexed', documentId: SAMPLE_DOCUMENT.id, indexedChunks: chunks.length, embeddingModel: EMBEDDING_MODEL })
  } catch {
    return error('INDEXING_UNAVAILABLE', 'Embedding, vector upsert, or metadata storage is temporarily unavailable.', 503)
  }
}

async function retrieve(env: Env, body: unknown): Promise<Response> {
  if (!body || typeof body !== 'object' || !('question' in body)) return error('INVALID_JSON', 'A JSON body with question is required.', 400)
  const { question, topK } = body as { question?: unknown; topK?: unknown }
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) return error('INVALID_QUESTION', 'question must be 1–2000 characters.', 400)
  if (topK !== undefined && (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 8)) return error('INVALID_TOP_K', 'topK must be an integer from 1 to 8.', 400)
  try {
    const queryVector = await embed(env, question.trim())
    const result = await env.VECTOR.query(queryVector, { topK: (topK as number | undefined) ?? 5, returnMetadata: 'all', filter: { namespace: NAMESPACE } })
    const matches = result.matches ?? []
    if (!matches.length) return json({ query: question.trim(), embeddingModel: EMBEDDING_MODEL, evidence: [], message: 'No matching sample evidence was found.' })
    const ids = matches.map((match) => match.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = await env.DB.prepare(`SELECT c.id, c.document_id, d.filename, c.chunk_index, c.text FROM chunks c JOIN documents d ON d.id = c.document_id AND d.namespace = c.namespace WHERE c.namespace = ? AND c.id IN (${placeholders})`).bind(NAMESPACE, ...ids).all<{ id: string; document_id: string; filename: string; chunk_index: number; text: string }>()
    const byId = new Map((rows.results ?? []).map((row) => [row.id, row]))
    const evidence: Citation[] = matches.flatMap((match) => {
      const row = byId.get(match.id)
      return row ? [{ chunkId: row.id, documentId: row.document_id, source: row.filename, chunkIndex: row.chunk_index, excerpt: row.text, score: match.score }] : []
    })
    return json({ query: question.trim(), embeddingModel: EMBEDDING_MODEL, evidence, message: evidence.length ? undefined : 'Vector results had no matching authorized metadata; no evidence is shown.' })
  } catch {
    return error('RETRIEVAL_UNAVAILABLE', 'Embedding or vector retrieval is temporarily unavailable.', 503)
  }
}

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const body: HealthResponse = { status: 'ok', service: 'novaops-worker', version: APP_VERSION, timestamp: new Date().toISOString() }
    return json(body)
  }
  if (request.method === 'POST' && url.pathname === '/api/index-sample') {
    if (request.headers.get('content-length') && Number(request.headers.get('content-length')) > 100) return error('INVALID_BODY', 'This endpoint accepts an empty body only.', 400)
    return indexSample(env)
  }
  if (request.method === 'POST' && url.pathname === '/api/retrieve') {
    let body: unknown
    try { body = await request.json() } catch { return error('INVALID_JSON', 'A JSON body is required.', 400) }
    return retrieve(env, body)
  }
  return error('NOT_FOUND', 'Route not found.', 404)
} } satisfies ExportedHandler<Env>
