import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEmbeddingStore } from './embeddingStore';
import type { EmbeddingChunk, IEmbeddingStore } from './embeddingTypes';

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `embed-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function makeChunk(overrides: Partial<EmbeddingChunk> = {}): EmbeddingChunk {
  const dims = 4;
  return {
    id: 'test.ts::foo::function::1',
    filePath: 'src/test.ts',
    symbolName: 'foo',
    symbolType: 'function',
    startLine: 1,
    endLine: 10,
    contentHash: 'abc123',
    embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    dimensions: dims,
    model: 'test-model',
    indexedAt: Date.now(),
    ...overrides,
  };
}

describe('embeddingStore', () => {
  let dbPath: string;
  let store: IEmbeddingStore;

  beforeEach(() => {
    dbPath = tmpDbPath();
    store = createEmbeddingStore(dbPath);
  });

  afterEach(() => {
    store.close();
    /* eslint-disable security/detect-non-literal-fs-filename -- test-controlled paths under tmpdir */
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(`${dbPath}-wal`); } catch { /* ignore */ }
    try { fs.unlinkSync(`${dbPath}-shm`); } catch { /* ignore */ }
    /* eslint-enable security/detect-non-literal-fs-filename */
  });

  it('starts empty', () => {
    const status = store.getStatus();
    expect(status.totalChunks).toBe(0);
    expect(status.totalFiles).toBe(0);
  });

  it('upserts and retrieves chunks by file', () => {
    const chunk = makeChunk();
    store.upsertChunks([chunk]);
    const status = store.getStatus();
    expect(status.totalChunks).toBe(1);
    expect(status.totalFiles).toBe(1);
    expect(status.model).toBe('test-model');
    const byFile = store.getChunksByFile('src/test.ts');
    expect(byFile).toHaveLength(1);
    expect(byFile[0].symbolName).toBe('foo');
  });

  it('deduplicates by content hash on upsert', () => {
    const chunk1 = makeChunk({ id: 'a::foo::function::1' });
    const chunk2 = makeChunk({ id: 'a::foo::function::1', symbolName: 'fooUpdated' });
    store.upsertChunks([chunk1]);
    store.upsertChunks([chunk2]);
    expect(store.getStatus().totalChunks).toBe(1);
    const byFile = store.getChunksByFile('src/test.ts');
    expect(byFile[0].symbolName).toBe('fooUpdated');
  });

  it('checks content hash existence', () => {
    expect(store.hasChunkHash('abc123')).toBe(false);
    store.upsertChunks([makeChunk()]);
    expect(store.hasChunkHash('abc123')).toBe(true);
    expect(store.hasChunkHash('xyz789')).toBe(false);
  });

  it('deletes chunks by file path', () => {
    store.upsertChunks([
      makeChunk({ id: 'a::f1::function::1', filePath: 'src/a.ts' }),
      makeChunk({ id: 'b::f2::function::1', filePath: 'src/b.ts', contentHash: 'def456' }),
    ]);
    expect(store.getStatus().totalChunks).toBe(2);
    store.deleteByFile('src/a.ts');
    expect(store.getStatus().totalChunks).toBe(1);
    expect(store.getChunksByFile('src/a.ts')).toHaveLength(0);
    expect(store.getChunksByFile('src/b.ts')).toHaveLength(1);
  });

  it('cosine similarity search returns nearest neighbors', () => {
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([0, 1, 0, 0]);
    const v3 = new Float32Array([0.9, 0.1, 0, 0]);
    store.upsertChunks([
      makeChunk({ id: 'c1', embedding: v1, contentHash: 'h1' }),
      makeChunk({ id: 'c2', embedding: v2, contentHash: 'h2' }),
      makeChunk({ id: 'c3', embedding: v3, contentHash: 'h3' }),
    ]);
    const query = new Float32Array([1, 0, 0, 0]);
    const results = store.searchSimilar(query, 2);
    expect(results).toHaveLength(2);
    expect(results[0].chunk.id).toBe('c1');
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[1].chunk.id).toBe('c3');
    expect(results[1].score).toBeGreaterThan(0.9);
  });

  it('clears all data', () => {
    store.upsertChunks([makeChunk()]);
    expect(store.getStatus().totalChunks).toBe(1);
    store.clear();
    expect(store.getStatus().totalChunks).toBe(0);
  });

  it('reports model version', () => {
    expect(store.getModelVersion()).toBe('');
    store.upsertChunks([makeChunk({ model: 'nomic-v1' })]);
    expect(store.getModelVersion()).toBe('nomic-v1');
  });

  it('persists across close and reopen', () => {
    store.upsertChunks([makeChunk()]);
    store.close();
    const store2 = createEmbeddingStore(dbPath);
    expect(store2.getStatus().totalChunks).toBe(1);
    store2.close();
    store = createEmbeddingStore(dbPath);
  });
});
