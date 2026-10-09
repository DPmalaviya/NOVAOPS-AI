import '@testing-library/jest-dom/vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Exercise the actual entrypoint without changing or exporting its components.
const mounted = vi.hoisted(() => ({ root: null as Root | null }))
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      mounted.root = actual.createRoot(...args)
      return mounted.root
    },
  }
})

const fetchMock = vi.fn<typeof fetch>()
const citation = {
  chunkId: 'public-sample:chunk-0',
  source: 'Public synthetic handbook',
  chunkIndex: 0,
  excerpt: 'Unsupported questions should return evidence only, never invented claims.',
  score: 0.87321,
  marker: 1,
}
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})

beforeEach(async () => {
  vi.resetModules()
  fetchMock.mockReset()
  // Fail closed: any unexpected endpoint fails the test rather than reaching a network.
  fetchMock.mockImplementation(async (input) => {
    if (input === '/api/health') return jsonResponse({ status: 'ok', version: 'test-version' })
    throw new Error(`Unexpected mocked endpoint: ${String(input)}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.body.innerHTML = '<div id="root"></div>'
  await act(async () => { await import('./main') })
  await screen.findByText('Foundation API online')
})

afterEach(async () => {
  await act(async () => mounted.root?.unmount())
  mounted.root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function indexSample() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'indexed', indexedChunks: 2 }))
  await userEvent.click(screen.getByRole('button', { name: 'Index sample corpus' }))
  await screen.findByText('Indexed 2 evidence chunk(s) with real embeddings.')
  expect(fetchMock).toHaveBeenLastCalledWith('/api/index-sample', { method: 'POST' })
  expect(screen.getByText('Indexed in this session')).toBeInTheDocument()
}

async function ask(body: unknown) {
  fetchMock.mockResolvedValueOnce(jsonResponse(body))
  await userEvent.type(screen.getByLabelText('Ask about the indexed sample'), 'How are unsupported questions handled?')
  await userEvent.click(screen.getByRole('button', { name: 'Ask with evidence' }))
  expect(fetchMock).toHaveBeenLastCalledWith('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'How are unsupported questions handled?' }),
  })
}

describe('workspace API behavior', () => {
  it('requires successful indexing and a nonblank question before asking', async () => {
    const button = screen.getByRole('button', { name: 'Ask with evidence' })
    await userEvent.type(screen.getByLabelText('Ask about the indexed sample'), 'A question')
    expect(button).toBeDisabled()
    await indexSample()
    expect(button).toBeEnabled()
    await userEvent.clear(screen.getByLabelText('Ask about the indexed sample'))
    await userEvent.type(screen.getByLabelText('Ask about the indexed sample'), '   ')
    expect(button).toBeDisabled()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/health', '/api/index-sample'])
  })

  it('indexes then asks and renders the generated answer, provider and genuine source metadata', async () => {
    await indexSample()
    await ask({ mode: 'generated', answer: 'Return evidence only for unsupported questions [1].', citations: [citation], provider: 'mock-provider', model: 'mock-model' })
    expect(await screen.findByText('Return evidence only for unsupported questions [1].')).toBeInTheDocument()
    expect(screen.getByText('SOURCE-CITED ANSWER')).toBeInTheDocument()
    expect(screen.getByText('Active response path: mock-provider · mock-model')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Generated an answer with validated citation markers via mock-provider · mock-model.')
    expect(screen.getByText('[1] Public synthetic handbook')).toBeInTheDocument()
    expect(screen.getByText('Chunk 1 · relevance 0.873')).toBeInTheDocument()
    expect(screen.getByText(citation.excerpt)).toBeInTheDocument()
    expect(screen.getByText(citation.chunkId)).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/health', '/api/index-sample', '/api/ask'])
  })

  it('shows retrieval-only fallback and removes a previous generated answer and provider', async () => {
    await indexSample()
    await ask({ mode: 'generated', answer: 'Previous generated answer [1].', citations: [citation], provider: 'mock-provider', model: 'mock-model' })
    await screen.findByText('Previous generated answer [1].')
    fetchMock.mockResolvedValueOnce(jsonResponse({ mode: 'retrieval-only', answer: null, citations: [{ ...citation, marker: undefined }], message: 'Generation unavailable; showing retrieved evidence only.' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ask with evidence' }))
    await screen.findByText('Generation unavailable; showing retrieved evidence only.')
    expect(screen.queryByText('Previous generated answer [1].')).not.toBeInTheDocument()
    expect(screen.queryByText('SOURCE-CITED ANSWER')).not.toBeInTheDocument()
    expect(screen.queryByText(/Active response path:/)).not.toBeInTheDocument()
    expect(screen.getByText('Public synthetic handbook')).toBeInTheDocument()
    expect(screen.getByText(citation.excerpt)).toBeInTheDocument()
  })

  it('keeps asking disabled after indexing fails and permits a successful retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Sample indexing unavailable.' }, 503))
    await userEvent.click(screen.getByRole('button', { name: 'Index sample corpus' }))
    await screen.findByText('Sample indexing unavailable.')
    expect(screen.getByText('Not indexed yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask with evidence' })).toBeDisabled()
    await indexSample()
  })

  it('surfaces ask API errors without inventing an answer or sources', async () => {
    await indexSample()
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Retrieval temporarily unavailable.' }, 503))
    await userEvent.type(screen.getByLabelText('Ask about the indexed sample'), 'A question')
    await userEvent.click(screen.getByRole('button', { name: 'Ask with evidence' }))
    await screen.findByText('Retrieval temporarily unavailable.')
    expect(screen.queryByText('SOURCE-CITED ANSWER')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.live-evidence')).toHaveLength(0)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask with evidence' })).toBeEnabled())
  })
})
