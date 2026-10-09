import { describe, expect, it } from 'vitest'
import { chunkText } from './chunker'
describe('chunkText', () => { it('keeps source identity and creates deterministic chunk IDs', () => { const chunks=chunkText({documentId:'doc-a',sourceLabel:'source.md',text:'One evidence paragraph.\n\nTwo evidence paragraph.'},200); expect(chunks).toHaveLength(1); expect(chunks[0]).toMatchObject({id:'doc-a-0000',sourceLabel:'source.md',chunkIndex:0}) }); it('rejects unsafe configuration', () => expect(() => chunkText({documentId:'a',sourceLabel:'b',text:'x'},200,200)).toThrow()) })
describe('zero overlap', () => {
  it('makes forward progress for long content without duplicating the whole previous chunk', () => {
    const chunks = chunkText({ documentId: 'long', sourceLabel: 'long.txt', text: 'word '.repeat(250) }, 200, 0)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.length).toBeLessThan(10)
    expect(chunks.every(chunk => chunk.text.length <= 200)).toBe(true)
  })
})
