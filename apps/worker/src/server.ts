// Local Node server: same fetch app, in-memory stores, local embeddings.
// Seeds the bundled sample corpus on first start so the demo works
// immediately and honestly (documents are labeled source: "sample").
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { buildDeps } from './config.js';
import { IngestionService } from '@novaops/rag';

const env = process.env as Record<string, string | undefined>;
const deps = await buildDeps(env);
const app = createApp(deps);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sampleDir = join(root, 'data', 'sample');
try {
  const files = (await readdir(sampleDir)).sort();
  const ingestion = new IngestionService(deps.store, deps.vectors, deps.embedder);
  for (const f of files) {
    const bytes = new Uint8Array(await readFile(join(sampleDir, f)));
    await ingestion.ingest({ filename: f, bytes, source: 'sample', sourceRef: `sample:${f}` });
  }
  console.log(`Seeded ${files.length} sample documents`);
} catch (err) {
  console.error('Sample seeding failed:', err instanceof Error ? err.message : err);
}

const port = Number(env.PORT || 8787);
const server = http.createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
      method: req.method, headers: req.headers as Record<string, string>,
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body,
    });
    const response = await app(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'internal', message: 'An internal error occurred' } }));
  }
});
server.listen(port, () => console.log(`NovaOps API listening on http://localhost:${port}`));
