#!/usr/bin/env python3
"""End-to-end latency benchmark against a running NovaOps API.

Measures /api/retrieve and /api/query round trips (retrieval-only when no
generation provider is configured, which the response states honestly).
Usage: python3 python/benchmarks/benchmark.py [--base http://localhost:8787]
"""
import argparse, json, statistics, time, urllib.request

QUERIES = [
    "How does provider fallback work?",
    "How does GitHub sync skip unchanged files?",
    "How is retrieval quality measured?",
    "What is the default chunking strategy?",
    "How are API keys protected?",
]

def post(base, path, payload):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--base", default="http://localhost:8787")
    args = ap.parse_args()
    for path in ["/api/retrieve", "/api/query"]:
        times = []
        for _ in range(2):
            for q in QUERIES:
                t0 = time.time(); post(args.base, path, {"question": q, "topK": 5}); times.append((time.time() - t0) * 1000)
        print(f"{path}: n={len(times)} median={statistics.median(times):.0f}ms min={min(times):.0f}ms max={max(times):.0f}ms")

if __name__ == "__main__":
    main()
