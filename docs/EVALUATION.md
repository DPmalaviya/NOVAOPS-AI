# Evaluation plan

Stage 7 will create a 25–50 case versioned dataset spanning direct factual queries, cross-document queries, no-answer cases, ambiguity, near-topic confusion and prompt-injection attempts. Each case records expected source IDs, answer constraints and whether abstention is required.

Measurements: Hit Rate@K, Recall@K where labels allow it, expected-source ranking, retrieval latency, citation availability/correctness, grounded-answer success through documented review, unsupported-claim rate where practical, no-answer correctness and generation latency. Claims require stored command output and dataset version; no metric is prefilled in the product.
