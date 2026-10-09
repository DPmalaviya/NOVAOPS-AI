"""Bounded synthetic /api/ask evaluator; mechanical scores are not grounding accuracy."""
import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def validate_dataset(dataset):
    cases = dataset['cases']
    if not cases or len(cases) > 25:
        raise ValueError('Expected 1–25 cases within the public daily client cap')
    if len({c['id'] for c in cases}) != len(cases):
        raise ValueError('Duplicate case IDs')
    for c in cases:
        if c['category'] not in ('supported', 'unsupported', 'adversarial'):
            raise ValueError('Invalid category')
        if not isinstance(c['question'], str) or not 1 <= len(c['question']) <= 2000:
            raise ValueError('Invalid question')
        if c['expected_mode'] not in ('generated', 'insufficient_evidence'):
            raise ValueError('Invalid expected mode')
    return cases


def assess(case, response):
    mode = response.get('mode')
    answer = response.get('answer')
    citations = response.get('citations', [])
    if not isinstance(citations, list):
        citations = []
    markers = [int(m) for m in re.findall(r'\[(\d+)\]', answer or '')] if isinstance(answer, str) else []
    by_marker = {c.get('marker'): c for c in citations if isinstance(c, dict)}
    valid_mapping = bool(markers) and all(m in by_marker and isinstance(by_marker[m].get('excerpt'), str) and bool(by_marker[m]['excerpt'].strip()) and bool(by_marker[m].get('chunkId')) for m in markers)
    source_present = any(isinstance(c, dict) and c.get('chunkId') == case.get('expected_chunk_id') and case.get('support_span', '') in c.get('excerpt', '') for c in citations) if case['category'] == 'supported' else None
    return {
        'mode_matches_target': mode == case['expected_mode'],
        'citation_mapping_valid': valid_mapping if mode == 'generated' else None,
        'expected_source_present': source_present,
        'unsupported_answer_emitted': case['category'] != 'supported' and bool(answer),
        'manual_claim_grounding': 'NOT_REVIEWED',
    }


def run(base_url, cases):
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Provide an explicit HTTPS demo base URL without credentials/query/fragment')
    rows = []
    for case in cases:
        started = time.monotonic()
        req = urllib.request.Request(base_url.rstrip('/') + '/api/ask', data=json.dumps({'question': case['question']}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'NovaOps-Synthetic-Evaluator/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=65) as result:
                payload = json.load(result)
                rows.append({'case_id': case['id'], 'http_status': result.status, 'seconds': round(time.monotonic()-started, 3), 'checks': assess(case, payload), 'response': payload})
        except urllib.error.HTTPError as exc:
            rows.append({'case_id': case['id'], 'http_status': exc.code, 'error': 'http_error'})
            if exc.code == 429:
                break  # Do not retry or evade the public cap.
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            rows.append({'case_id': case['id'], 'error': type(exc).__name__})
    return {'scope': 'live endpoint synthetic evaluation', 'attempted': len(rows), 'planned': len(cases), 'manual_grounding': 'NOT_REVIEWED', 'results': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', default='data/evaluation/sample-grounding-v1.json')
    parser.add_argument('--base-url')
    parser.add_argument('--output', default='data/runtime/sample-evaluation.json')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    cases = validate_dataset(json.loads(Path(args.dataset).read_text()))
    if args.validate_only:
        print(json.dumps({'status': 'dataset_valid', 'cases': len(cases), 'live_calls': 0}))
        return
    if not args.base_url:
        parser.error('--base-url is required for live evaluation')
    report = run(args.base_url, cases)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2))
    print(json.dumps({'report': str(path), 'attempted': report['attempted'], 'manual_grounding': 'NOT_REVIEWED'}))


if __name__ == '__main__':
    main()
