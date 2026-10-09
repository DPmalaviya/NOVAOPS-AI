#!/usr/bin/env python3
"""Bulk-ingest a folder of supported documents into a running NovaOps API.
Usage: python3 python/ingestion/bulk_ingest.py <folder> [--base http://localhost:8787]
"""
import argparse, base64, json, sys, urllib.request
from pathlib import Path

SUPPORTED = {".pdf", ".docx", ".txt", ".md", ".markdown", ".csv"}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("folder"); ap.add_argument("--base", default="http://localhost:8787")
    args = ap.parse_args()
    folder = Path(args.folder)
    files = [p for p in sorted(folder.rglob("*")) if p.suffix.lower() in SUPPORTED]
    if not files:
        print("No supported files found", file=sys.stderr); sys.exit(1)
    for p in files:
        payload = {"filename": p.name, "contentBase64": base64.b64encode(p.read_bytes()).decode()}
        req = urllib.request.Request(args.base + "/api/documents", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.loads(r.read())
            doc = out["document"]
            print(f"{p.name}: {'skipped (unchanged)' if out.get('skipped') else f\"indexed {doc['chunkCount']} chunks\"}")
        except urllib.error.HTTPError as e:
            print(f"{p.name}: FAILED {e.code} {e.read().decode()[:200]}", file=sys.stderr)

if __name__ == "__main__":
    main()
