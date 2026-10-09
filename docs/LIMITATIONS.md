# Limitations

1. **Demonstration system.** NovaOps is a portfolio-grade RAG application on free tiers, not a confidential-document production service.
2. **No persisted uploads.** Uploaded file bytes are not stored; re-indexing an upload requires re-uploading. Only extracted chunks and metadata persist.
3. **PDF quality.** Text extraction depends on the PDF containing extractable text. Scanned/image PDFs return no chunks and a clear warning; there is no OCR in V1.
4. **DOCX fidelity.** Paragraph text is extracted; headings, tables, and formatting are not preserved.
5. **Free-tier ceilings.** Workers AI gives 10,000 Neurons/day and Vectorize free storage fits roughly 6,500 vectors at 768d. A large corpus needs the paid tier or a smaller embedding model.
6. **Rate limits are per-isolate** on Workers (each isolate keeps its own counters), so they are abuse dampeners, not hard global quotas.
7. **GitHub sync is public-repo only**, unauthenticated by default (60 API requests/hour); large repositories may need a token and multiple syncs.
8. **Streaming is not implemented.** Answers return as complete responses; the provider layer can support streaming later without changing the router contract.
9. **Single index, single workspace.** No multi-tenancy, accounts, or per-user corpora in V1.
10. **Evaluation scale.** 35 hand-written cases over a small synthetic corpus measure the pipeline honestly but do not predict quality on large real-world corpora.
