# Evaluation Approach

Evaluation is a required part of NovaOps, not an afterthought. The evaluation dataset contains direct factual questions, cross-document questions, no-answer questions, ambiguous questions, similar-topic confusion questions, adversarial questions, and prompt-injection attempts.

## Retrieval metrics

Retrieval quality is measured with Hit Rate at K, which records whether an expected source appears in the top-K retrieved chunks. The system also records the ranking of the expected source and the retrieval latency for each question.

## Answer metrics

Answer quality is measured by grounded-answer success, citation correctness, whether no-answer questions correctly return an insufficient-evidence response, citation availability, and generation latency. NovaOps never reports evaluation numbers that were not produced by an actual evaluation run.

## Chunking experiments

At least two chunking configurations are compared during evaluation, varying chunk size and overlap, so the final default chunk size is chosen from measured results rather than intuition.
