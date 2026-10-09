import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { HealthResponse } from '@novaops/shared'
import './styles.css'

type View = 'workspace' | 'documents' | 'research' | 'system'
type HealthState = 'checking' | 'online' | 'offline'

const navigation: Array<{ id: View; label: string; hint: string }> = [
  { id: 'workspace', label: 'Workspace', hint: 'Evidence-led answers' },
  { id: 'documents', label: 'Documents', hint: 'Source management' },
  { id: 'research', label: 'Research', hint: 'Multi-source briefs' },
  { id: 'system', label: 'System', hint: 'Health and evaluation' }
]

function App() {
  const [view, setView] = useState<View>('workspace')
  const [health, setHealth] = useState<HealthState>('checking')
  const [version, setVersion] = useState<string>('—')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Health check failed')
        return response.json() as Promise<HealthResponse>
      })
      .then((data) => { setHealth(data.status === 'ok' ? 'online' : 'offline'); setVersion(data.version) })
      .catch(() => setHealth('offline'))
    return () => controller.abort()
  }, [])

  return <div className="shell">
    <aside className="sidebar" aria-label="Primary navigation">
      <a className="brand" href="#workspace" onClick={() => setView('workspace')} aria-label="NovaOps AI home"><span className="brand-mark">N</span><span><strong>NovaOps</strong><small>AI knowledge workspace</small></span></a>
      <nav>{navigation.map((item) => <button key={item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setView(item.id)}><span>{item.label}</span><small>{item.hint}</small></button>)}</nav>
      <div className="sidebar-note"><span className={`status-dot ${health}`} aria-hidden="true"/><div><strong>{health === 'online' ? 'Foundation API online' : health === 'checking' ? 'Checking API' : 'API unavailable'}</strong><small>Stage 1 · v{version}</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">{view.toUpperCase()}</p><h1>{view === 'workspace' ? 'A grounded workspace, built deliberately.' : navigation.find((item) => item.id === view)?.label}</h1></div><span className="stage-badge">Foundation · in progress</span></header>
      {view === 'workspace' && <Workspace health={health} />}
      {view === 'documents' && <Documents />}
      {view === 'research' && <Research />}
      {view === 'system' && <System health={health} version={version} />}
    </main>
  </div>
}

function Workspace({ health }: { health: HealthState }) {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [evidence, setEvidence] = useState<Array<{ chunkId: string; source: string; chunkIndex: number; excerpt: string; score: number; marker?: number }>>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [providerLabel, setProviderLabel] = useState('')
  const [indexed, setIndexed] = useState(false)
  async function indexSample() {
    setBusy(true); setStatus('Indexing the public synthetic sample…')
    try { const response = await fetch('/api/index-sample', { method: 'POST' }); const result = await response.json() as { status?: string; indexedChunks?: number; skippedChunks?: number; message?: string }; if (!response.ok) throw new Error(result.message || 'Sample indexing failed'); setIndexed(true); setStatus(result.status === 'unchanged' ? 'Sample is already current; no embeddings were regenerated.' : `Indexed ${result.indexedChunks ?? 0} evidence chunk(s) with real embeddings.`) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Indexing unavailable.') } finally { setBusy(false) }
  }
  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!question.trim()) return
    setBusy(true); setStatus('Retrieving evidence, then trying configured generation providers…'); setEvidence([]); setAnswer(null); setProviderLabel('')
    try { const response = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) }); const result = await response.json() as { mode?: string; answer?: string | null; citations?: typeof evidence; message?: string; code?: string; provider?: string; model?: string }; if (!response.ok) throw new Error(result.message || result.code || 'Retrieval failed'); setEvidence(result.citations ?? []); setAnswer(result.answer ?? null); setProviderLabel(result.provider ? `${result.provider} · ${result.model}` : ''); setStatus(result.mode === 'generated' ? `Generated an answer with validated citation markers via ${result.provider} · ${result.model}.` : result.message || 'No evidence found.') }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Retrieval unavailable.') } finally { setBusy(false) }
  }
  return <section className="workspace-grid" id="workspace"><div className="hero-card"><p className="eyebrow accent">EVIDENCE BEFORE ANSWERS</p><h2>Ask only when the system can show its work.</h2><p className="lede">Index the public synthetic sample, then inspect real semantic search results. The workspace retrieves evidence first, then generates only when a configured provider returns an answer with valid source markers.</p><div className="principles"><span>Retrieve</span><i>→</i><span>Ground</span><i>→</i><span>Cite</span></div><button className="primary-action" onClick={indexSample} disabled={busy || health !== 'online'}>{busy ? 'Working…' : indexed ? 'Re-index sample' : 'Index sample corpus'}</button><form className="query-form" onSubmit={askQuestion}><label htmlFor="knowledge-question">Ask about the indexed sample</label><textarea id="knowledge-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} placeholder="How does NovaOps handle unsupported questions?"/><button className="secondary-action" disabled={busy || !indexed || !question.trim()}>Ask with evidence</button></form><div className="notice"><strong>Evidence first, grounded generation second.</strong><span>No simulated answer or citation is shown. If generation is unavailable or citation markers fail validation, the app shows retrieval evidence only.</span></div>{status && <p className="live-status" role="status">{status}</p>}{providerLabel && <p className="provider-label">Active response path: {providerLabel}</p>}{answer && <article className="answer-card"><p className="eyebrow accent">GROUNDED ANSWER</p><p>{answer}</p></article>}{evidence.map((item) => <article className="live-evidence" key={item.chunkId}><header><strong>{item.marker ? `[${item.marker}] ` : ''}{item.source}</strong><span>Chunk {item.chunkIndex + 1} · relevance {item.score.toFixed(3)}</span></header><p>{item.excerpt}</p><small>{item.chunkId}</small></article>)}</div><aside className="evidence-card"><p className="eyebrow">SYSTEM READINESS</p><div className="readiness"><span className={`status-dot ${health}`} aria-hidden="true"/><div><strong>{health === 'online' ? 'API health verified' : health === 'checking' ? 'Checking API health' : 'API health not reachable'}</strong><p>{health === 'online' ? 'The Worker health endpoint is responding.' : 'Start the Worker locally or complete deployment configuration.'}</p></div></div><hr/><dl><div><dt>Sample index</dt><dd>{indexed ? 'Indexed in this session' : 'Not indexed yet'}</dd></div><div><dt>Embedding model</dt><dd>Qwen3 · 1,024 dims</dd></div><div><dt>Generation provider</dt><dd>Not enabled</dd></div></dl></aside></section>
}
function Documents() { return <section className="single-column"><p className="eyebrow accent">SOURCE MANAGEMENT</p><h2>Documents will be indexed, not merely listed.</h2><p className="lede">Planned support: PDF, DOCX, TXT, Markdown, and CSV. Each item will retain only genuine processing status, source identity, content version, and extraction metadata.</p><div className="empty-state"><div className="empty-icon">↓</div><h3>Document processing begins in Stage 4</h3><p>Uploads stay disabled until parsing, isolation, limits, cleanup, and deletion behavior are implemented and tested.</p><button disabled aria-disabled="true">Upload unavailable</button></div></section> }
function Research() { return <section className="single-column"><p className="eyebrow accent">CONTROLLED WORKFLOW</p><h2>Research will expose outcomes, never hidden reasoning.</h2><p className="lede">The future workflow will retrieve candidate evidence, retain high-confidence passages, generate a structured brief, and verify citation mappings. It will show real stages and counts only.</p><div className="workflow">{['Interpret the question', 'Retrieve indexed evidence', 'Select supported passages', 'Generate a cited brief', 'Verify citations'].map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong><small>Pending implementation</small></div>)}</div></section> }
function System({ health, version }: { health: HealthState; version: string }) { return <section className="single-column"><p className="eyebrow accent">TRUTHFUL OPERATIONS</p><h2>Metrics appear only after collection exists.</h2><div className="system-grid"><article><span className={`status-dot ${health}`}/><p>Worker health</p><strong>{health === 'online' ? 'Online' : health === 'checking' ? 'Checking' : 'Unavailable'}</strong></article><article><p>Runtime version</p><strong>{version}</strong><small>From the health endpoint</small></article><article><p>Evaluation summary</p><strong>Not measured</strong><small>Stage 7 will add reproducible results.</small></article><article><p>Provider fallback events</p><strong>Not implemented</strong><small>Stage 3 must collect actual events.</small></article></div></section> }

createRoot(document.getElementById('root')!).render(<App />)
