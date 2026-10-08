import { APP_VERSION, type HealthResponse } from '@novaops/shared'
export interface Env { DB: D1Database; VECTOR: VectorizeIndex; AI: Ai }
const headers = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }
const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers })
const error = (code: string, message: string, status: number) => json({ code, message }, { status })
export default { async fetch(request: Request, env: Env): Promise<Response> {
 const url = new URL(request.url)
 if (request.method === 'GET' && url.pathname === '/api/health') { const body: HealthResponse = { status: 'ok', service: 'novaops-worker', version: APP_VERSION, timestamp: new Date().toISOString() }; return json(body) }
 if (request.method === 'POST' && url.pathname === '/api/retrieve') {
   let question: unknown; try { question = (await request.json() as { question?: unknown }).question } catch { return error('INVALID_JSON','A JSON body is required.',400) }
   if (typeof question !== 'string' || !question.trim() || question.length > 2000) return error('INVALID_QUESTION','question must be 1–2000 characters.',400)
   try { const result = await env.AI.run('@cf/qwen/qwen3-embedding-0.6b', { text: question.trim() }) as { data: number[][] }; const vector = result.data?.[0]; if (!vector || vector.length !== 1024) return error('EMBEDDING_UNAVAILABLE','Embedding response was invalid.',503); const matches = await env.VECTOR.query(vector, { topK: 5, returnMetadata: 'all' }); return json({ query: question.trim(), model: '@cf/qwen/qwen3-embedding-0.6b', matches: matches.matches.map(m => ({ id:m.id, score:m.score, metadata:m.metadata })) }) } catch { return error('RETRIEVAL_UNAVAILABLE','Embedding or vector retrieval is temporarily unavailable.',503) }
 }
 return error('NOT_FOUND','Route not found.',404)
} } satisfies ExportedHandler<Env>
