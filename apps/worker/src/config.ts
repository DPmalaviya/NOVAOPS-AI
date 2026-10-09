// Build app dependencies from environment. Every provider is optional;
// with no keys at all, NovaOps still runs retrieval + retrieval-only
// answers, which is the designed final fallback.
import {
  MemoryStore, D1Store, MemoryVectorStore, VectorizeStore,
  TransformersEmbedder, WorkersAIEmbedder, GeminiEmbedder,
  GeminiProvider, WorkersAIProvider, OllamaCloudProvider, ProviderRouter,
  type GenerationProvider,
} from '@novaops/rag';
import type { AppDeps } from './app.js';

export interface EnvLike {
  GEMINI_API_KEY?: string; GEMINI_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string;
  WORKERS_AI_MODEL?: string;
  OLLAMA_API_KEY?: string; OLLAMA_MODEL?: string; OLLAMA_BASE_URL?: string;
  EMBEDDER?: string; EMBEDDING_MODEL?: string;
  GITHUB_TOKEN?: string;
  DB?: unknown; VECTORIZE?: unknown; AI?: { run: (m: string, i: unknown) => Promise<any> };
}

export function buildProviders(env: EnvLike): GenerationProvider[] {
  const providers: GenerationProvider[] = [];
  if (env.GEMINI_API_KEY) providers.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-2.5-flash'));
  const cfRest = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
    ? { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN } : undefined;
  if (env.AI || cfRest) providers.push(new WorkersAIProvider(env.WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fp8-fast', env.AI, cfRest));
  if (env.OLLAMA_API_KEY) providers.push(new OllamaCloudProvider(env.OLLAMA_API_KEY, env.OLLAMA_MODEL || 'nemotron-3-nano', env.OLLAMA_BASE_URL || 'https://ollama.com'));
  return providers;
}

export function buildEmbedder(env: EnvLike): AppDeps['embedder'] {
  const choice = (env.EMBEDDER || 'local').toLowerCase();
  if (choice === 'workers-ai') {
    const rest = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
      ? { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN } : undefined;
    return new WorkersAIEmbedder(env.EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5', env.AI, rest);
  }
  if (choice === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('EMBEDDER=gemini requires GEMINI_API_KEY');
    return new GeminiEmbedder(env.GEMINI_API_KEY, env.EMBEDDING_MODEL || 'gemini-embedding-001');
  }
  return new TransformersEmbedder(env.EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5');
}

export async function buildDeps(env: EnvLike): Promise<AppDeps> {
  let store: AppDeps['store'];
  if (env.DB) { const d1 = new D1Store(env.DB); await d1.init(); store = d1; }
  else store = new MemoryStore();
  const vectors: AppDeps['vectors'] = env.VECTORIZE ? new VectorizeStore(env.VECTORIZE) : new MemoryVectorStore();
  return {
    store, vectors,
    embedder: buildEmbedder(env),
    router: new ProviderRouter(buildProviders(env)),
    githubToken: env.GITHUB_TOKEN,
  };
}
