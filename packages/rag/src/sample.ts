export const SAMPLE_DOCUMENT = {
  id: 'sample-rag-principles',
  filename: 'novaops-rag-principles.md',
  sourceType: 'sample' as const,
  content: `# Grounded answers\n\nNovaOps returns answers only when retrieved evidence supports them. Semantic retrieval uses an embedding of the question and cosine vector search across chunk embeddings. Citations identify the actual document and retained chunk.\n\n# Retrieval and failure behavior\n\nThe provider router is separate from retrieval. Generation is introduced only after retrieval has been verified. If retrieval is unavailable, NovaOps reports the failure rather than returning unrelated passages. A generation outage can still return retrieved evidence, but an embedding or vector-store outage cannot.`,
}
