# Synthetic sample evaluation

sample-grounding-v1.json contains 25 labeled cases: 10 supported, 10 unsupported, 5 adversarial. Labels describe desired behavior, not executed model performance. All content is synthetic/public. The corpus is packages/rag/src/sample.ts; expected supported chunk is sample-rag-principles-0000.

## Offline verification
From repository root:

```sh
python3 python/evaluation/run_sample.py --validate-only
python3 -m unittest discover -s python/evaluation -p 'test_*.py' -v
```

These commands spend no inference quota and measure only fixture validity/evaluator behavior.

## Live evaluation
Use an explicitly authorized HTTPS demo endpoint with existing free-tier resources:

```sh
python3 python/evaluation/run_sample.py --base-url https://YOUR_AUTHORIZED_DEMO_HOST --output data/runtime/sample-evaluation.json
```

No live URL is currently guaranteed. The runner sends one request per case, never retries and stops at HTTP 429. Its 25-case maximum matches the client daily cap but existing requests may leave fewer than 25 available. Do not bypass caps with alternate identities. The runner never provisions resources or enables billing. Before executing, confirm available no-charge inference allowance. Local HTTP/client restrictions may produce failures; those are not model results.

The report distinguishes target-mode match, valid numbered citation mapping, expected source presence, unsupported-answer emission and per-request latency. Claim-level grounding is always NOT_REVIEWED until a human reviews answer claims against the stored excerpts. Valid citations do not prove a factual claim, and citation correctness is not a calibrated confidence value. This single-document dataset cannot establish multi-document retrieval quality, namespace isolation or production accuracy. No broad accuracy or capacity claims may be made from it.

Keep generated raw reports under ignored data/runtime unless reviewed and sanitized for publication. Persist sanitized results with date, code revision, corpus hash, model, quota failures and reviewer notes before marking acceptance complete.
