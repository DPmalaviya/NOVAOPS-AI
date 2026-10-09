# Stage 3 live synthetic evaluation

Code checkpoint: 2da2b1d. Corpus: one public synthetic RAG-principles document. Model: Workers AI @cf/google/gemma-4-26b-a4b-it. Gemini/Ollama not configured. Date: October 8, 2026 (America/Chicago).

| Observation | Result |
|---|---:|
| Final live requests | 25 |
| HTTP 200 | 25 |
| Supported questions with generated answers | 10/10 |
| Generated answers with valid mapped citations | 10/10 |
| Unsupported questions with explicit abstention | 9/10 |
| Generation-failure evidence-only responses | 6 |
| Emitted unsupported answers | 0 |
| Target-mode matches | 19/25 |

The AI assistant inspected the ten emitted answers against their returned source excerpts and found support for each. This is qualitative review of a tiny corpus, not independent human validation or a general accuracy measurement. All five adversarial cases encountered generation failures; safe fallback prevented answers but does not prove injection resistance. Failure events remain in results.json. Similarity scores are not confidence probabilities.

The endpoint initially returned 404/1042 during propagation; bounded health retry reached readiness before the preserved run. Used curl transport with the Python evaluator's scoring functions; the stdlib HTTP runner itself was not used for the final HTTP calls. Exact remaining cloud quota was not exposed by the available spec. No inference retries or rate-cap evasion were used. Temporary Worker was disabled and deleted; existing storage remains. No production deployment or billing activation occurred.

Stage 3 is still IN PROGRESS. Prior local test results remain in the handoff; this documentation-only result checkpoint does not claim a new full test run.
