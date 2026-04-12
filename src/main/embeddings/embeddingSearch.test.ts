import { describe, expect, it } from 'vitest';

import { fuseResults } from './embeddingSearch';
import type { EmbeddingSearchResult } from './embeddingTypes';

function makeResult(id: string, score: number): EmbeddingSearchResult {
  return {
    chunk: { id, filePath: `src/${id}.ts`, symbolName: id, symbolType: 'function', startLine: 1, endLine: 10, contentHash: id },
    score,
  };
}

describe('embeddingSearch', () => {
  it('fuses vector and keyword results via RRF', () => {
    const vector = [makeResult('a', 0.9), makeResult('b', 0.8), makeResult('c', 0.7)];
    const keyword = [makeResult('b', 1.0), makeResult('d', 0.9), makeResult('a', 0.8)];
    const fused = fuseResults(vector, keyword, 3);
    expect(fused).toHaveLength(3);
    const ids = fused.map((r) => r.chunk.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('returns up to topK results', () => {
    const vector = [makeResult('a', 0.9), makeResult('b', 0.8)];
    const keyword = [makeResult('c', 1.0), makeResult('d', 0.9)];
    const fused = fuseResults(vector, keyword, 2);
    expect(fused).toHaveLength(2);
  });

  it('handles empty inputs', () => {
    expect(fuseResults([], [], 5)).toHaveLength(0);
    const vector = [makeResult('a', 0.9)];
    expect(fuseResults(vector, [], 5)).toHaveLength(1);
  });
});
