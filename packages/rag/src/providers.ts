// Generation providers behind one normalized interface.
import type { ErrorCategory, ProviderName, ProviderResult } from '@novaops/shared';

export interface GenerateOptions { system: string; user: string; maxTokens?: number; timeoutMs?: number; }
export interface GenerationProvider {
  readonly name: ProviderName;
  readonly model: string;
  generate(opts: GenerateOptions): Promise<ProviderResult>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly category: ErrorCategory, readonly retryable: boolean, readonly status?: number) {
    super(message);
  }
}

export function classifyHttp(status: number, bodyText = ''): ProviderError {
  if (status === 401 || status === 403) return new ProviderError(`HTTP ${status}: authentication failed`, 'auth', false, status);
  if (status === 404) return new ProviderError(`HTTP ${status}: model or endpoint not found`, 'invalid_model', false, status);
  if (status === 429) {
    const quota = /quota|billing|exceeded/i.test(bodyText);
    return new ProviderError(`HTTP 429: ${quota ? 'quota exhausted' : 'rate limited'}`, quota ? 'quota' : 'rate_limit', !quota, status);
  }
  if (status >= 500) return new ProviderError(`HTTP ${status}: provider unavailable`, 'unavailable', true, status);
  return new ProviderError(`HTTP ${status}`, 'unknown', false, status);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  catch (err) {
    if ((err as Error).name === 'AbortError') throw new ProviderError(`Timed out after ${timeoutMs}ms`, 'timeout', true);
    throw new ProviderError(`Network error: ${(err as Error).message}`, 'unavailable', true);
  } finally { clearTimeout(timer); }
}

export class GeminiProvider implements GenerationProvider {
  readonly name: ProviderName = 'gemini';
  constructor(private apiKey: string, readonly model = 'gemini-2.5-flash') {}
  async generate(opts: GenerateOptions): Promise<ProviderResult> {
    const t0 = Date.now();
    const r = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      { method: 'POST', headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: 'user', parts: [{ text: opts.user }] }],
          generationConfig: { maxOutputTokens: opts.maxTokens ?? 2048, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
        }) },
      opts.timeoutMs ?? 20000,
    );
    const text = await r.text();
    if (!r.ok) throw classifyHttp(r.status, text);
    let j: any; try { j = JSON.parse(text); } catch { throw new ProviderError('Malformed JSON from Gemini', 'bad_response', true); }
    const out = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (!out) throw new ProviderError('Gemini returned an empty response', 'bad_response', true);
    return { provider: this.name, model: this.model, text: out, latencyMs: Date.now() - t0,
      usage: { inputTokens: j?.usageMetadata?.promptTokenCount, outputTokens: j?.usageMetadata?.candidatesTokenCount } };
  }
}

export class WorkersAIProvider implements GenerationProvider {
  readonly name: ProviderName = 'workers-ai';
  constructor(
    readonly model = '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    private binding?: { run: (m: string, i: unknown) => Promise<any> },
    private rest?: { accountId: string; apiToken: string },
  ) {}
  async generate(opts: GenerateOptions): Promise<ProviderResult> {
    const t0 = Date.now();
    const input = { messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }], max_tokens: opts.maxTokens ?? 2048, temperature: 0.2 };
    try {
      let res: any;
      if (this.binding) {
        res = await this.binding.run(this.model, input);
      } else if (this.rest) {
        const r = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${this.rest.accountId}/ai/run/${this.model}`,
          { method: 'POST', headers: { Authorization: `Bearer ${this.rest.apiToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
          opts.timeoutMs ?? 20000);
        const text = await r.text();
        if (!r.ok) throw classifyHttp(r.status, text);
        res = JSON.parse(text)?.result;
      } else throw new ProviderError('Workers AI is not configured (no binding or REST credentials)', 'auth', false);
      const out = res?.response ?? '';
      if (!out) throw new ProviderError('Workers AI returned an empty response', 'bad_response', true);
      return { provider: this.name, model: this.model, text: out, latencyMs: Date.now() - t0 };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`Workers AI error: ${(err as Error).message}`, 'unavailable', true);
    }
  }
}

export class OllamaCloudProvider implements GenerationProvider {
  readonly name: ProviderName = 'ollama-cloud';
  constructor(private apiKey: string, readonly model = 'nemotron-3-nano', private baseUrl = 'https://ollama.com') {}
  async generate(opts: GenerateOptions): Promise<ProviderResult> {
    const t0 = Date.now();
    const r = await fetchWithTimeout(`${this.baseUrl}/api/chat`,
      { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, stream: false, messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }], options: { num_predict: opts.maxTokens ?? 2048, temperature: 0.2 } }) },
      opts.timeoutMs ?? 25000);
    const text = await r.text();
    if (!r.ok) throw classifyHttp(r.status, text);
    let j: any; try { j = JSON.parse(text); } catch { throw new ProviderError('Malformed JSON from Ollama Cloud', 'bad_response', true); }
    const out = j?.message?.content ?? '';
    if (!out) throw new ProviderError('Ollama Cloud returned an empty response', 'bad_response', true);
    return { provider: this.name, model: this.model, text: out, latencyMs: Date.now() - t0,
      usage: { inputTokens: j?.prompt_eval_count, outputTokens: j?.eval_count } };
  }
}
