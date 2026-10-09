// Evaluation: retrieval metrics (Hit Rate@K, expected-source rank) and
// answer-level checks (no-answer correctness, citation availability).
import type { Retriever } from './retriever.js';

export interface EvalCase {
  id: string;
  question: string;
  /** filename expected in retrieval results; null => no-answer case */
  expectedSource: string | null;
  category: 'factual' | 'cross-document' | 'no-answer' | 'ambiguous' | 'confusion' | 'adversarial' | 'injection';
  notes?: string;
}

export interface EvalCaseResult {
  id: string; category: string; hitAtK: boolean; expectedRank: number | null;
  topScore: number; retrievedSources: string[];
}
export interface EvalSummary {
  cases: number; topK: number; hitRateAtK: number;
  meanReciprocalRank: number; noAnswerCases: number; noAnswerCorrect: number;
  meanRetrievalMs: number; byCategory: Record<string, { cases: number; hitRate: number }>;
  results: EvalCaseResult[];
}

export async function evaluateRetrieval(retriever: Retriever, cases: EvalCase[], topK: number, minTopScore: number): Promise<EvalSummary> {
  const results: EvalCaseResult[] = [];
  let noAnswerCorrect = 0; let noAnswerCases = 0; let totalMs = 0;
  for (const c of cases) {
    const { evidence, retrievalMs } = await retriever.retrieve(c.question, topK);
    totalMs += retrievalMs;
    const sources = evidence.map((e) => e.filename);
    if (c.expectedSource === null) {
      noAnswerCases += 1;
      const correct = !evidence.length || (evidence[0]?.score ?? 0) < minTopScore;
      if (correct) noAnswerCorrect += 1;
      results.push({ id: c.id, category: c.category, hitAtK: correct, expectedRank: null, topScore: evidence[0]?.score ?? 0, retrievedSources: sources });
    } else {
      const rank = sources.indexOf(c.expectedSource);
      results.push({ id: c.id, category: c.category, hitAtK: rank >= 0, expectedRank: rank >= 0 ? rank + 1 : null, topScore: evidence[0]?.score ?? 0, retrievedSources: sources });
    }
  }
  const answerable = results.filter((r) => r.expectedRank !== null || cases.find((c) => c.id === r.id)?.expectedSource !== null);
  const denom = results.length || 1;
  const mrr = results.reduce((s, r) => s + (r.expectedRank ? 1 / r.expectedRank : 0), 0) / (answerable.length || 1);
  const byCategory: Record<string, { cases: number; hitRate: number }> = {};
  for (const r of results) {
    byCategory[r.category] ??= { cases: 0, hitRate: 0 };
    byCategory[r.category].cases += 1;
    if (r.hitAtK) byCategory[r.category].hitRate += 1;
  }
  for (const k of Object.keys(byCategory)) byCategory[k].hitRate = byCategory[k].hitRate / byCategory[k].cases;
  return {
    cases: results.length, topK, hitRateAtK: results.filter((r) => r.hitAtK).length / denom,
    meanReciprocalRank: mrr, noAnswerCases, noAnswerCorrect,
    meanRetrievalMs: totalMs / denom, byCategory, results,
  };
}
