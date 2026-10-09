# Retrieval Guide

## Semantic search

NovaOps starts with semantic Top-K vector retrieval. The question and the indexed documents use the same embedding model within an index, so their vectors are comparable. The embedding provider, model, and version are stored with each index, along with the indexing timestamp.

## Chunking strategy

The default chunking strategy is recursive and structure-aware: documents are split at headings and paragraph boundaries first, and chunks respect a token budget with a small overlap between consecutive chunks. Each chunk records its chunk ID, document ID, chunk index, text, source metadata, and content hash.

## When to add more

Hybrid search with BM25 and reranking are not enabled by default. They are added only if evaluation demonstrates a measurable improvement over plain semantic retrieval. The retrieval architecture keeps the door open for a reranker stage between retrieval and context construction.
