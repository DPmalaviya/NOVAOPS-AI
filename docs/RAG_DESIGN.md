# RAG design

The implementation remains explicit rather than hidden behind a single framework abstraction:

1. Validate question and request limits.
2. Create query embedding with the exact model/version used by the selected index.
3. Search a VectorStore adapter for bounded Top-K candidates and authorized metadata filters.
4. Optionally rerank only after an evaluation demonstrates a net improvement.
5. Build bounded context from retained evidence.
6. Send a prompt that treats sources as untrusted data, requires source-supported claims, and permits an insufficient-evidence answer.
7. Map answer citations to source IDs and real metadata.
8. Record redacted latency, provider outcome and citation availability.

Chunking begins with a configurable recursive or structure-aware token-aware strategy. At least two chunking configurations and multiple Top-K values are evaluated before final defaults are selected. Similarity values are retrieval diagnostics, not calibrated truth probabilities.
