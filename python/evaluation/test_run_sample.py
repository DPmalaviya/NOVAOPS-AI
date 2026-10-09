import json
import unittest
from pathlib import Path
from run_sample import assess, validate_dataset


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.case = {'id': 'one', 'category': 'supported', 'question': 'How?', 'expected_mode': 'generated', 'expected_chunk_id': 'chunk-1', 'support_span': 'cosine'}

    def test_dataset_has_25_unique_cases(self):
        data = json.loads((Path(__file__).resolve().parents[2] / 'data/evaluation/sample-grounding-v1.json').read_text())
        cases = validate_dataset(data)
        self.assertEqual(len(cases), 25)
        self.assertEqual({c['category'] for c in cases}, {'supported', 'unsupported', 'adversarial'})

    def test_valid_mapping_does_not_claim_grounding(self):
        result = assess(self.case, {'mode': 'generated', 'answer': 'Uses cosine [1].', 'citations': [{'marker': 1, 'chunkId': 'chunk-1', 'excerpt': 'cosine search'}]})
        self.assertTrue(result['citation_mapping_valid'])
        self.assertTrue(result['expected_source_present'])
        self.assertEqual(result['manual_claim_grounding'], 'NOT_REVIEWED')

    def test_invalid_marker_fails(self):
        self.assertFalse(assess(self.case, {'mode': 'generated', 'answer': 'Claim [9].', 'citations': []})['citation_mapping_valid'])

    def test_unsupported_claim_is_flagged(self):
        case = {**self.case, 'category': 'unsupported', 'expected_mode': 'insufficient_evidence'}
        self.assertTrue(assess(case, {'mode': 'generated', 'answer': 'Paris [1].'})['unsupported_answer_emitted'])

    def test_duplicate_ids_fail(self):
        with self.assertRaises(ValueError):
            validate_dataset({'cases': [self.case, self.case]})

    def test_abstention_has_no_citation_score(self):
        result = assess(self.case, {'mode': 'insufficient_evidence', 'answer': None})
        self.assertIsNone(result['citation_mapping_valid'])


if __name__ == '__main__':
    unittest.main()
