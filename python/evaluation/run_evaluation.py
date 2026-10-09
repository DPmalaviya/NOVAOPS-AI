#!/usr/bin/env python3
"""NovaOps retrieval evaluation against a running API server.

Indexes nothing itself: it calls POST /api/retrieve for each case in
data/evaluation/questions.json and computes Hit Rate@K, expected-source
rank, and no-answer correctness from the API's real responses.

Usage:
  python3 python/evaluation/run_evaluation.py [--base http://localhost:8787] [--topk 5]
Requires the local server to be running (npm run dev:api) with the
sample corpus seeded.
"""
import argparse, json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def post(base, path, payload):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json", "X-Session-Id": "novaops-evaluation"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8787")
    ap.add_argument("--topk", type=int, default=5)
    ap.add_argument("--threshold", type=float, default=0.50)
    args = ap.parse_args()
    cases = json.loads((ROOT / "data/evaluation/questions.json").read_text())
    hits, rr_sum, answerable = 0, 0.0, 0
    no_ok, no_total = 0, 0
    lat = []
    results = []
    for c in cases:
        t0 = time.time()
        try:
            out = post(args.base, "/api/retrieve", {"question": c["question"], "topK": args.topk})
        except Exception as e:
            print(f"{c['id']}: request failed: {e}", file=sys.stderr)
            results.append({"id": c["id"], "error": str(e)})
            continue
        lat.append((time.time() - t0) * 1000)
        sources = [e["filename"] for e in out["evidence"]]
        top = out["evidence"][0]["score"] if out["evidence"] else 0.0
        if c["expectedSource"] is None:
            no_total += 1
            correct = (not sources) or top < args.threshold
            no_ok += int(correct)
            results.append({"id": c["id"], "correctNoAnswer": correct, "topScore": round(top, 3)})
        else:
            answerable += 1
            rank = sources.index(c["expectedSource"]) + 1 if c["expectedSource"] in sources else None
            hits += int(rank is not None)
            rr_sum += (1.0 / rank) if rank else 0.0
            results.append({"id": c["id"], "rank": rank, "topScore": round(top, 3)})
    summary = {
        "cases": len(cases), "topK": args.topk,
        "hitRateAtK": round(hits / answerable, 4) if answerable else None,
        "meanReciprocalRank": round(rr_sum / answerable, 4) if answerable else None,
        "noAnswerCorrect": f"{no_ok}/{no_total}",
        "meanRetrievalRoundTripMs": round(sum(lat) / len(lat), 1) if lat else None,
        "results": results,
    }
    print(json.dumps(summary, indent=2))
    out_path = ROOT / "data/evaluation/results/python-eval-latest.json"
    out_path.write_text(json.dumps(summary, indent=2))
    print(f"Wrote {out_path}", file=sys.stderr)

if __name__ == "__main__":
    main()
