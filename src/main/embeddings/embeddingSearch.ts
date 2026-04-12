/**
 * embeddingSearch.ts — Semantic search over the embedding index.
 *
 * Supports pure vector search and hybrid (vector + keyword) via
 * reciprocal rank fusion (RRF).
 */

import type {
  EmbeddingSearchResult,
  IEmbeddingProvider,
  IEmbeddingStore,
} from './embeddingTypes';

const RRF_K = 60;

/** Pure vector similarity search. */
export async function searchSimilar(
  query: string,
  topK: number,
  store: IEmbeddingStore,
  provider: IEmbeddingProvider,
): Promise<EmbeddingSearchResult[]> {
  const [queryVec] = await provider.embed([query], 'query');
  return store.searchSimilar(queryVec, topK);
}

/** Reciprocal rank fusion score for combining ranked lists. */
function rrfScore(rank: number): number {
  return 1 / (RRF_K + rank);
}

/** Hybrid search: vector + keyword results fused via RRF. */
export function fuseResults(
  vectorResults: EmbeddingSearchResult[],
  keywordResults: EmbeddingSearchResult[],
  topK: number,
): EmbeddingSearchResult[] {
  const scores = new Map<string, { result: EmbeddingSearchResult; score: number }>();
  addRrfScores(scores, vectorResults);
  addRrfScores(scores, keywordResults);
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.result);
}

function addRrfScores(
  scores: Map<string, { result: EmbeddingSearchResult; score: number }>,
  results: EmbeddingSearchResult[],
): void {
  for (const [rank, r] of results.entries()) {
    const existing = scores.get(r.chunk.id);
    const increment = rrfScore(rank);
    if (existing) {
      existing.score += increment;
    } else {
      scores.set(r.chunk.id, { result: r, score: increment });
    }
  }
}
