// NovaOps API application. A framework-free fetch handler so the exact
// same code runs on Cloudflare Workers and on a local Node server.
import { DEFAULT_LIMITS, isSupportedFile, type AppLimits } from '@novaops/shared';
import {
  IngestionService, Retriever, QueryService, ResearchService, ProviderRouter,
  GitHubSyncService, RateLimiter, UploadBudget, type MetadataStore, type VectorStore,
  type Embedder,
} from '@novaops/rag';

export interface AppDeps {
  store: MetadataStore;
  vectors: VectorStore;
  embedder: Embedder;
  router: ProviderRouter;
  limits?: AppLimits;
  githubToken?: string;
  version?: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function createApp(deps: AppDeps) {
  const limits = deps.limits ?? DEFAULT_LIMITS;
  const ingestion = new IngestionService(deps.store, deps.vectors, deps.embedder);
  const retriever = new Retriever(deps.store, deps.vectors, deps.embedder);
  const queryService = new QueryService(retriever, deps.router, deps.embedder, deps.store, { minTopScore: 0.50, maxContextChars: limits.maxContextChars });
  const researchService = new ResearchService(retriever, deps.router, deps.embedder, deps.store, deps.vectors);
  const github = new GitHubSyncService(deps.store, ingestion);
  const rateLimiter = new RateLimiter(limits.queriesPerMinute);
  const uploadBudget = new UploadBudget(limits.maxFilesPerSession);

  const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...extra } });
  const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

  function clientKey(req: Request): string {
    return req.headers.get('x-session-id') || req.headers.get('cf-connecting-ip') || 'anonymous';
  }

  async function readJson(req: Request): Promise<any> {
    try { return await req.json(); } catch { return null; }
  }

  function validateQuestion(body: any): string | null {
    const q = body?.question;
    if (typeof q !== 'string' || !q.trim()) return 'A non-empty "question" string is required';
    if (q.length > limits.maxQueryChars) return `Question exceeds the ${limits.maxQueryChars} character limit`;
    return null;
  }
  function clampTopK(body: any): number {
    const k = Number(body?.topK ?? 5);
    if (!Number.isFinite(k)) return 5;
    return Math.max(1, Math.min(limits.maxTopK, Math.floor(k)));
  }

  async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = req.method.toUpperCase();
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Session-Id' } });
    }
    try {
      if (method === 'GET' && path === '/api/health') {
        return json({ status: 'ok', version: deps.version ?? '1.0.0', embedder: { provider: deps.embedder.provider, model: deps.embedder.model, dimensions: deps.embedder.dimensions }, providers: deps.router.configured, stores: { metadata: deps.store.kind, vectors: deps.vectors.kind } });
      }
      if (method === 'GET' && path === '/api/documents') {
        return json({ documents: await deps.store.listDocuments() });
      }
      if (method === 'POST' && path === '/api/documents') {
        const body = await readJson(req);
        const filename = body?.filename;
        if (typeof filename !== 'string' || !isSupportedFile(filename)) return fail(415, 'unsupported_file', 'Supported types: PDF, DOCX, TXT, Markdown, CSV');
        if (typeof body?.contentBase64 !== 'string') return fail(400, 'bad_request', 'contentBase64 is required');
        const bytes = Uint8Array.from(Buffer.from(body.contentBase64, 'base64'));
        if (bytes.byteLength === 0) return fail(400, 'empty_file', 'The uploaded file is empty');
        if (bytes.byteLength > limits.maxFileBytes) return fail(413, 'file_too_large', `File exceeds the ${Math.floor(limits.maxFileBytes / 1048576)} MB limit`);
        const session = clientKey(req);
        if (!uploadBudget.tryConsume(session)) return fail(429, 'upload_limit', `Upload limit reached for this session (${limits.maxFilesPerSession} files)`);
        try {
          const result = await ingestion.ingest({ filename, bytes, source: 'upload', mime: typeof body?.mime === 'string' ? body.mime : '' });
          return json({ document: result.document, skipped: result.skipped, timings: result.timings, warnings: result.warnings }, 201);
        } catch (err) {
          return fail(422, 'processing_failed', err instanceof Error ? err.message : 'Processing failed');
        }
      }
      const delMatch = /^\/api\/documents\/([^/]+)$/.exec(path);
      if (method === 'DELETE' && delMatch) {
        const ok = await ingestion.deleteDocument(decodeURIComponent(delMatch[1]));
        return ok ? json({ deleted: true }) : fail(404, 'not_found', 'Document not found');
      }
      const reMatch = /^\/api\/documents\/([^/]+)\/reindex$/.exec(path);
      if (method === 'POST' && reMatch) {
        return fail(409, 'content_unavailable', 'Re-index requires the original file content; re-upload the file or re-run GitHub sync for GitHub documents.');
      }
      if (method === 'POST' && path === '/api/retrieve') {
        const body = await readJson(req);
        const err = validateQuestion(body); if (err) return fail(400, 'bad_question', err);
        const rl = rateLimiter.check(clientKey(req));
        if (!rl.allowed) return fail(429, 'rate_limited', 'Too many requests', );
        const { evidence, retrievalMs } = await retriever.retrieve(body.question.trim(), clampTopK(body));
        return json({ question: body.question, evidence, retrievalMs, embedder: { provider: deps.embedder.provider, model: deps.embedder.model, dimensions: deps.embedder.dimensions } });
      }
      if (method === 'POST' && (path === '/api/query' || path === '/api/research')) {
        const body = await readJson(req);
        const err = validateQuestion(body); if (err) return fail(400, 'bad_question', err);
        const rl = rateLimiter.check(clientKey(req));
        if (!rl.allowed) return json({ error: { code: 'rate_limited', message: 'Too many requests, please wait a moment' } }, 429, { 'Retry-After': String(rl.retryAfterSec) });
        const res = path === '/api/research'
          ? await researchService.research(body.question.trim())
          : await queryService.query(body.question.trim(), clampTopK(body));
        return json(res);
      }
      if (method === 'POST' && path === '/api/github/sync') {
        const body = await readJson(req);
        const repoSpec = typeof body?.repo === 'string' ? body.repo : '';
        const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repoSpec);
        if (!m) return fail(400, 'bad_repo', 'repo must be in "owner/name" form and must be a public repository');
        const run = await github.sync({ owner: m[1], repo: m[2], branch: typeof body?.branch === 'string' && body.branch ? body.branch : 'main', pathPrefix: typeof body?.path === 'string' ? body.path : undefined, token: deps.githubToken });
        return json({ sync: run }, run.status === 'completed' ? 200 : 502);
      }
      if (method === 'GET' && path === '/api/github/history') {
        return json({ runs: await deps.store.listSyncRuns(20) });
      }
      if (method === 'GET' && path === '/api/system') {
        const docs = await deps.store.listDocuments();
        const queries = await deps.store.recentQueries(100);
        const attempts = await deps.store.recentProviderAttempts(20);
        const syncRuns = await deps.store.listSyncRuns(5);
        const sorted = [...queries].map((q) => q.totalMs).sort((a, b) => a - b);
        const p50 = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
        const rSorted = [...queries].map((q) => q.retrievalMs).sort((a, b) => a - b);
        const fallbackEvents = attempts.filter((a) => !a.ok).length;
        return json({
          documents: docs.length,
          readyDocuments: docs.filter((d) => d.state === 'ready').length,
          chunks: await deps.vectors.count(),
          embedder: { provider: deps.embedder.provider, model: deps.embedder.model, dimensions: deps.embedder.dimensions },
          providersConfigured: deps.router.configured,
          recentAttempts: attempts,
          fallbackEventsRecorded: fallbackEvents,
          queriesRecorded: queries.length,
          medianTotalMs: p50,
          medianRetrievalMs: rSorted.length ? rSorted[Math.floor(rSorted.length / 2)] : null,
          lastSync: syncRuns[0] ?? null,
          evaluation: await deps.store.getEvalSummary(),
          recentErrors: attempts.filter((a) => !a.ok).slice(0, 5),
        });
      }
      if (method === 'POST' && path === '/api/evaluation/summary') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object') return fail(400, 'bad_request', 'A JSON summary is required');
        await deps.store.putEvalSummary(body);
        return json({ stored: true });
      }
      if (method === 'GET' && path === '/api/evaluation/summary') {
        return json({ evaluation: await deps.store.getEvalSummary() });
      }
      return fail(404, 'not_found', 'Route not found');
    } catch (err) {
      // Never leak stack traces or internal details to clients.
      return fail(500, 'internal', 'An internal error occurred');
    }
  }

  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    // CORS for the separately-hosted web app (public demo API).
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  };
}
