import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileToBase64, type DocRecord, type EvidenceItem, type QueryResult } from './api';

type Page = 'workspace' | 'documents' | 'research' | 'system';
interface Message { role: 'user' | 'assistant'; text: string; result?: QueryResult; }

const EXAMPLES = [
  'How does provider fallback work?',
  'How does GitHub sync skip unchanged files?',
  'How is retrieval quality measured?',
  'What happens if every generation provider fails?',
];

function scoreLabel(s: number) { return s.toFixed(2); }

function EvidencePanel({ evidence, active, onSelect }: { evidence: EvidenceItem[]; active: number; onSelect: (i: number) => void }) {
  const item = evidence[active];
  return (
    <aside className="evidence-panel" aria-label="Retrieved evidence">
      <div className="panel-head">
        <div><p className="overline">Evidence</p><h3>Retrieved sources</h3></div>
        <span className="small-pill">{evidence.length ? `Top ${evidence.length}` : 'None'}</span>
      </div>
      {!evidence.length && <p className="subtle small">No evidence yet. Ask a question and the retrieved chunks will appear here, exactly as the model saw them.</p>}
      <div className="evidence-list">
        {evidence.map((e, i) => (
          <button key={e.chunkId} className={`evidence-item${i === active ? ' active' : ''}`} onClick={() => onSelect(i)}>
            <div><strong>{e.filename}</strong><span>{e.heading ?? 'Section'}{e.page ? ` · page ${e.page}` : ''}{e.startLine ? ` · lines ${e.startLine}–${e.endLine}` : ''}</span></div>
            <b>{scoreLabel(e.score)}</b>
          </button>
        ))}
      </div>
      {item && (
        <div className="evidence-preview">
          <span>{item.filename}{item.heading ? ` · ${item.heading}` : ''}</span>
          <p>{item.text}</p>
        </div>
      )}
    </aside>
  );
}

function AnswerBody({ result }: { result: QueryResult }) {
  if (result.insufficientEvidence) {
    return (
      <div className="notice warn" role="status">
        <strong>Insufficient evidence.</strong>
        <p>The indexed documents do not contain enough information to answer this question, so NovaOps will not guess. Try rephrasing, or add a document that covers the topic.</p>
      </div>
    );
  }
  if (result.retrievalOnly) {
    return (
      <div className="notice" role="status">
        <strong>Generation is temporarily unavailable.</strong>
        <p>Every generation provider failed for this request, so here is the retrieved evidence on its own. The attempts are listed below and the sources are in the evidence panel.</p>
        {result.attempts.length > 0 && (
          <ul className="attempts">
            {result.attempts.map((a, i) => <li key={i}>{a.provider} · {a.model} — {a.errorCategory ?? 'failed'} ({a.latencyMs} ms)</li>)}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="answer-text">{(result.answer ?? '').split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="answer-meta">
        <span>{result.provider} · {result.model}</span>
        <span>Retrieval {result.timings.retrievalMs} ms · Generation {result.timings.generationMs} ms</span>
      </div>
      {result.citations.length > 0 ? (
        <div className="citations">
          {result.citations.map((c) => (
            <span key={c.marker} className="cite-chip">[{c.marker}] {c.filename}{c.heading ? ` — ${c.heading}` : ''}{c.page ? ` · p.${c.page}` : ''}{c.startLine ? ` · lines ${c.startLine}–${c.endLine}` : ''}</span>
          ))}
        </div>
      ) : (
        <p className="subtle small">The answer did not include verifiable citation markers; treat it with care and check the evidence panel.</p>
      )}
    </div>
  );
}

function Workspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [activeEv, setActiveEv] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setError('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    try {
      const result = await api<QueryResult>('/api/query', { method: 'POST', body: JSON.stringify({ question, topK: 5 }) });
      setMessages((m) => [...m, { role: 'assistant', text: '', result }]);
      setEvidence(result.evidence); setActiveEv(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally { setBusy(false); }
  }, [busy]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="workspace">
      <section className="chat-panel">
        <div className="chat-intro">
          <span className="eyebrow">Grounded answers with citations</span>
          <h2>Ask across your documents.</h2>
          <p>NovaOps retrieves relevant evidence first, then generates an answer from that evidence only. Unsupported questions return an explicit insufficient-evidence response.</p>
        </div>
        <div className="prompt-row">
          {EXAMPLES.map((x) => <button key={x} className="prompt-chip" onClick={() => ask(x)} disabled={busy}>{x}</button>)}
        </div>
        <div className="messages" aria-live="polite">
          {messages.map((m, i) => (
            <div className="message" key={i}>
              <div className="avatar">{m.role === 'user' ? 'You' : 'N'}</div>
              <div className="message-body">
                <div className="message-meta"><strong>{m.role === 'user' ? 'You' : 'NovaOps'}</strong>
                  {m.result?.provider && <span>{m.result.provider} · {m.result.model}</span>}
                  {m.result?.retrievalOnly && <span>evidence only</span>}
                </div>
                {m.role === 'user' ? <p>{m.text}</p> : m.result ? <AnswerBody result={m.result} /> : null}
              </div>
            </div>
          ))}
          {busy && <div className="skeleton" aria-label="Loading"><div /><div /><div /></div>}
          <div ref={endRef} />
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000}
            placeholder="Ask a question about your indexed documents" aria-label="Question"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
          <button type="submit" disabled={busy || !input.trim()}>Ask</button>
        </form>
        <p className="helper">Answers are generated only from retrieved evidence. Inspect the sources on the right.</p>
      </section>
      <EvidencePanel evidence={evidence} active={activeEv} onSelect={setActiveEv} />
    </div>
  );
}

function Documents() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [status, setStatus] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [syncing, setSyncing] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ documents: DocRecord[] }>('/api/documents');
      setDocs(d.documents);
      const h = await api<{ runs: any[] }>('/api/github/history');
      setRuns(h.runs);
    } catch { setStatus('Could not reach the API. Documents cannot be loaded right now.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of [...files]) {
      setStatus(`Uploading ${file.name}…`);
      try {
        const contentBase64 = await fileToBase64(file);
        const r = await api<any>('/api/documents', { method: 'POST', body: JSON.stringify({ filename: file.name, mime: file.type, contentBase64 }) });
        setStatus(r.skipped ? `${file.name} was unchanged and skipped.` : `${file.name} indexed: ${r.document.chunkCount} chunks.`);
      } catch (e) { setStatus(e instanceof Error ? e.message : 'Upload failed'); }
    }
    load();
  };

  const sync = async () => {
    if (!repo.trim()) return;
    setSyncing(true); setStatus('Syncing GitHub repository…');
    try {
      const r = await api<any>('/api/github/sync', { method: 'POST', body: JSON.stringify({ repo: repo.trim(), branch }) });
      const s = r.sync;
      setStatus(`Sync ${s.status}: ${s.added} added, ${s.updated} updated, ${s.skipped} skipped, ${s.deleted} deleted, ${s.failed} failed.`);
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Sync failed'); }
    setSyncing(false); load();
  };

  const remove = async (id: string) => {
    try { await api(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Delete failed'); }
  };

  return (
    <div>
      <div className="page-lede"><p className="overline">Knowledge base</p><h2>Add documents, then ask questions about them.</h2>
        <p>Public demo uploads should stay small, temporary, and limited to public or synthetic information.</p></div>
      <div className="document-layout">
        <div className="card">
          <div className="upload-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
            <div className="upload-symbol" aria-hidden>↑</div>
            <h3>Upload documents</h3>
            <p>PDF, DOCX, TXT, Markdown, CSV</p>
            <button onClick={() => fileRef.current?.click()}>Choose files</button>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.csv" hidden onChange={(e) => upload(e.target.files)} />
          </div>
          <div className="limit-row"><span>Public demo limits</span><strong>≤ 10 MB/file · ≤ 5 files/session</strong></div>
          <div className="sync-box">
            <h3>Sync a public GitHub repository</h3>
            <label>Repository<input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository" /></label>
            <label>Branch<input value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
            <button className="secondary-wide" onClick={sync} disabled={syncing || !repo.trim()}>{syncing ? 'Syncing…' : 'Sync now'}</button>
            <p className="subtle small">Unchanged files are skipped by blob SHA. Deleted files are removed from the index.</p>
          </div>
          {status && <p className="status-line" role="status">{status}</p>}
        </div>
        <div className="card">
          <div className="panel-head"><div><p className="overline">Index</p><h3>Documents</h3></div><span className="small-pill">{docs.length}</span></div>
          <div className="doc-list">
            {docs.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="file-badge">{(d.filename.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4)}</div>
                <div><strong>{d.filename}</strong><span>{d.source}{d.sourceRef ? ` · ${d.sourceRef}` : ''} · {d.chunkCount} chunks · {(d.sizeBytes / 1024).toFixed(1)} KB</span>
                  {d.state === 'failed' && d.error && <span className="err-text">{d.error}</span>}</div>
                <em className={d.state === 'failed' ? 'failed' : ''}>{d.state}</em>
                <button className="ghost" onClick={() => remove(d.id)} aria-label={`Delete ${d.filename}`}>Delete</button>
              </div>
            ))}
            {!docs.length && <p className="subtle small">No documents indexed yet. The API seeds a small sample corpus on local startup; upload a file or sync a repository to add more.</p>}
          </div>
          {runs.length > 0 && (
            <div className="sync-history">
              <h4>Sync history</h4>
              {runs.slice(0, 5).map((r) => (
                <p key={r.id} className="subtle small">{r.repo}@{r.branch} — {r.status} · +{r.added} ~{r.updated} ={r.skipped} −{r.deleted} · {new Date(r.startedAt).toLocaleString()}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card ingestion-card">
        <div><p className="overline">Ingestion</p><h3>What happens after upload</h3></div>
        <div className="flow"><span>Parse</span><i>→</i><span>Chunk</span><i>→</i><span>Embed</span><i>→</i><span>Index</span><i>→</i><span>Ready</span></div>
      </div>
    </div>
  );
}

function Research() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const run = async () => {
    if (!q.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api<QueryResult>('/api/research', { method: 'POST', body: JSON.stringify({ question: q.trim() }) })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Research failed'); }
    setBusy(false);
  };
  return (
    <div className="research-grid">
      <section>
        <p className="overline">Research mode</p>
        <h2>Build a cited brief from multiple sources.</h2>
        <p className="subtle">One deterministic workflow: interpret the question, retrieve across the knowledge base, select high-confidence evidence, generate a structured brief, and verify its citations. No hidden chain-of-thought, no invented steps — each state below reflects a real operation.</p>
        <div className="research-box">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={5} maxLength={2000}
            placeholder="Example: Compare the provider fallback design with the security model and explain how they interact." aria-label="Research question" />
          <button onClick={run} disabled={busy || !q.trim()}>{busy ? 'Researching…' : 'Start research'}</button>
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {result && (
          <div className="card brief-card">
            {result.insufficientEvidence || result.retrievalOnly ? <AnswerBody result={result} /> : (
              <>
                <div className="answer-text">{(result.answer ?? '').split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
                <div className="answer-meta"><span>{result.provider} · {result.model}</span><span>{result.chunksSearched ?? 0} chunks searched</span></div>
                <div className="citations">{result.citations.map((c) => <span key={c.marker} className="cite-chip">[{c.marker}] {c.filename}{c.heading ? ` — ${c.heading}` : ''}</span>)}</div>
              </>
            )}
          </div>
        )}
      </section>
      <aside className="card workflow-card">
        <p className="overline">Workflow</p>
        {(result?.steps ?? [
          { id: 'interpret', label: 'Interpret question', detail: 'Derive retrieval queries', status: 'pending' },
          { id: 'retrieve', label: 'Retrieve evidence', detail: 'Search indexed chunks', status: 'pending' },
          { id: 'select', label: 'Select evidence', detail: 'Keep high-confidence sources', status: 'pending' },
          { id: 'generate', label: 'Generate brief', detail: 'Synthesize with citations', status: 'pending' },
          { id: 'verify', label: 'Verify citations', detail: 'Map markers to real chunks', status: 'pending' },
        ]).map((s, i) => (
          <div className={`step ${s.status === 'done' ? 'done' : ''}`} key={s.id}>
            <span>{i + 1}</span>
            <div><strong>{s.label}</strong><small>{result ? s.detail : s.detail}</small></div>
            <b>{s.status === 'done' ? '✓' : s.status === 'failed' ? '!' : ''}</b>
          </div>
        ))}
        {result && <div className="evidence-mini">
          <h4>Evidence used</h4>
          {result.evidence.map((e) => <p key={e.chunkId} className="subtle small">{e.filename} · {scoreLabel(e.score)}</p>)}
        </div>}
      </aside>
    </div>
  );
}

function SystemPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<any>('/api/system').then(setData).catch(() => setError('Could not reach the API, so no system data is shown. NovaOps does not display placeholder metrics.')); }, []);
  if (error) return <div className="notice error" role="alert">{error}</div>;
  if (!data) return <div className="skeleton big"><div /><div /><div /></div>;
  const ev = data.evaluation;
  return (
    <div>
      <div className="system-grid">
        <div className="card span-2">
          <p className="overline">Model routing</p><h3>Graceful fallback, in order</h3>
          <div className="provider-chain">
            {['Gemini', 'Workers AI', 'Ollama Cloud', 'Evidence only'].map((p, i) => (
              <div key={p} className={`provider${i === 3 ? ' final-provider' : ''}`}><span>{i + 1}</span><div><strong>{p}</strong><small>{i === 3 ? 'Always available' : data.providersConfigured.some((x: string) => x.startsWith(p.toLowerCase().split(' ')[0])) ? 'Configured' : 'Not configured'}</small></div></div>
            )).reduce((acc: any[], el, i) => i === 0 ? [el] : [...acc, <i key={`a${i}`}>→</i>, el], [])}
          </div>
          <p className="subtle small">Configured providers: {data.providersConfigured.length ? data.providersConfigured.join(' · ') : 'none — retrieval-only mode'}. Fallback events recorded this session: {data.fallbackEventsRecorded}.</p>
        </div>
        <div className="card metric-card"><p className="overline">Index</p><strong>{data.documents}</strong><span>documents ({data.readyDocuments} ready)</span><small>{data.chunks} chunks · Embedder: {data.embedder.provider} · {data.embedder.model} ({data.embedder.dimensions}d)</small></div>
        <div className="card metric-card"><p className="overline">Latency (measured)</p><strong>{data.medianTotalMs === null ? '—' : `${data.medianTotalMs} ms`}</strong><span>median total over {data.queriesRecorded} recorded queries</span><small>{data.medianRetrievalMs === null ? 'No queries recorded yet this session.' : `Median retrieval ${data.medianRetrievalMs} ms. Values appear only after real queries run.`}</small></div>
        <div className="card span-2">
          <p className="overline">Evaluation</p>
          {ev ? (
            <div><h3>Hit Rate@{ev.topK}: {(ev.hitRateAtK * 100).toFixed(1)}%</h3>
              <p className="subtle">MRR {ev.meanReciprocalRank?.toFixed(3)} · {ev.cases} cases · No-answer correct {ev.noAnswerCorrect}/{ev.noAnswerCases} · Mean retrieval {ev.meanRetrievalMs?.toFixed(1)} ms · Embedder: {ev.embedder ?? 'see results file'} · Chunking: {ev.chunkPreset ?? 'medium'} (measured locally; see docs/EVALUATION.md)</p></div>
          ) : <p className="subtle">No evaluation has been run against this deployment yet. Run <code>npm run eval</code> locally — results are stored here only after a real run.</p>}
        </div>
        <div className="card span-2">
          <p className="overline">Recent provider attempts</p>
          {data.recentAttempts?.length ? data.recentAttempts.slice(0, 8).map((a: any, i: number) => (
            <p key={i} className="subtle small">{new Date(a.at).toLocaleTimeString()} — {a.provider} · {a.model} — {a.ok ? `ok (${a.latencyMs} ms)` : `failed: ${a.errorCategory ?? 'unknown'}`}</p>
          )) : <p className="subtle small">No generation attempts recorded yet.</p>}
          <p className="overline" style={{ marginTop: 16 }}>Last synchronization</p>
          <p className="subtle small">{data.lastSync ? `${data.lastSync.repo}@${data.lastSync.branch} — ${data.lastSync.status} · ${new Date(data.lastSync.startedAt).toLocaleString()}` : 'No GitHub sync has run on this deployment yet.'}</p>
        </div>
      </div>
    </div>
  );
}

const PAGE_INFO: Record<Page, [string, string]> = {
  workspace: ['Workspace', 'Ask your knowledge'],
  documents: ['Knowledge base', 'Documents'],
  research: ['Research', 'Research'],
  system: ['System', 'System'],
};

export default function App() {
  const [page, setPage] = useState<Page>('workspace');
  const [dark, setDark] = useState(false);
  useEffect(() => { document.body.classList.toggle('dark', dark); }, [dark]);
  const [label, title] = PAGE_INFO[page];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">N</div>
          <div className="brand-copy"><strong>NovaOps AI</strong><span>Knowledge workspace</span></div></div>
        <nav aria-label="Primary">
          {(Object.keys(PAGE_INFO) as Page[]).map((p) => (
            <button key={p} className={`nav-item${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{PAGE_INFO[p][0]}</button>
          ))}
        </nav>
        <div className="sidebar-foot"><span className="status-dot" />
          <div><strong>RAG workspace</strong><small>Grounded answers · Inspectable citations</small></div></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div><p className="overline">{label}</p><h1>{title}</h1></div>
          <div className="top-actions">
            <span className="model-pill">Gemini → Workers AI → Ollama → Evidence</span>
            <button className="icon-button" onClick={() => setDark((d) => !d)} aria-label="Toggle color theme">◐</button>
          </div>
        </header>
        {page === 'workspace' && <Workspace />}
        {page === 'documents' && <Documents />}
        {page === 'research' && <Research />}
        {page === 'system' && <SystemPage />}
        <footer>NovaOps AI · AI knowledge &amp; research workspace · Answers are generated only from retrieved evidence</footer>
      </main>
    </div>
  );
}
