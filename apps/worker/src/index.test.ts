import { describe, expect, it } from 'vitest'
import worker, { type Env } from './index'

function makeEnv() {
  const docs = new Map<string, { content_hash: string; status: string; filename?: string }>()
  const chunks = new Map<string, { id: string; document_id: string; filename: string; chunk_index: number; text: string }>()
  const vectors = new Map<string, { id: string; values: number[]; metadata: Record<string, string | number> }>()
  let embeddings = 0
  const db = {
    prepare(sql: string) {
      const values: unknown[] = []
      return {
        bind(...args: unknown[]) { values.push(...args); return this },
        async first() { return docs.get(String(values[0])) ?? null },
        async all() {
          return { results: [...chunks.values()].filter((row) => values.includes(row.id)) }
        },
        sql,
        values,
      }
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      for (const statement of statements) {
        if (statement.sql.startsWith('INSERT OR REPLACE INTO documents')) docs.set(String(statement.values[0]), { content_hash: String(statement.values[4]), status: String(statement.values[5]), filename: String(statement.values[2]) })
        if (statement.sql.startsWith('INSERT OR REPLACE INTO chunks')) chunks.set(String(statement.values[0]), { id: String(statement.values[0]), document_id: String(statement.values[1]), filename: String(statement.values[5]), chunk_index: Number(statement.values[3]), text: String(statement.values[4]) })
      }
      return []
    },
  }
  const vector = {
    async upsert(records: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }>) { for (const row of records) vectors.set(row.id, row); return { count: records.length } },
    async query(_values: number[], options: { topK: number }) { return { matches: [...vectors.values()].slice(0, options.topK).map((row) => ({ id: row.id, score: 0.91, metadata: row.metadata })) } },
  }
  const ai = { async run() { embeddings += 1; return { data: [Array.from({ length: 1024 }, () => 0.01)], shape: [1, 1024] } } }
  return { env: { DB: db, VECTOR: vector, AI: ai } as unknown as Env, stats: () => ({ docs: docs.size, chunks: chunks.size, vectors: vectors.size, embeddings }) }
}

describe('Worker RAG retrieval foundation', () => {
  it('indexes the sample corpus once and skips an unchanged re-index', async () => {
    const { env, stats } = makeEnv()
    const first = await worker.fetch(new Request('https://novaops.test/api/index-sample', { method: 'POST' }), env)
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ status: 'indexed', indexedChunks: 1 })
    const afterFirst = stats()
    const second = await worker.fetch(new Request('https://novaops.test/api/index-sample', { method: 'POST' }), env)
    expect(await second.json()).toMatchObject({ status: 'unchanged', indexedChunks: 0 })
    expect(stats()).toEqual({ ...afterFirst, embeddings: afterFirst.embeddings })
    expect(stats().vectors).toBe(1)
  })

  it('returns source-backed evidence and validates user input', async () => {
    const { env } = makeEnv()
    await worker.fetch(new Request('https://novaops.test/api/index-sample', { method: 'POST' }), env)
    const response = await worker.fetch(new Request('https://novaops.test/api/retrieve', { method: 'POST', body: JSON.stringify({ question: 'How are answers grounded?', topK: 1 }) }), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ embeddingModel: '@cf/qwen/qwen3-embedding-0.6b', evidence: [{ source: 'novaops-rag-principles.md', chunkId: 'sample-rag-principles-0000', score: 0.91 }] })
    const invalid = await worker.fetch(new Request('https://novaops.test/api/retrieve', { method: 'POST', body: JSON.stringify({ question: '  ', topK: 20 }) }), env)
    expect(invalid.status).toBe(400)
  })

  it('returns a safe unavailable response for malformed embedding output', async () => {
    const { env } = makeEnv()
    const malformedEnv = { ...env, AI: { run: async () => ({ data: [[0.2, 0.3]] }) } } as unknown as Env
    const response = await worker.fetch(new Request('https://novaops.test/api/retrieve', { method: 'POST', body: JSON.stringify({ question: 'question' }) }), malformedEnv)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'RETRIEVAL_UNAVAILABLE' })
  })
})
