import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { indexFiles } from './embeddingIndexer';
import { createStubProvider } from './embeddingProvider';
import { createEmbeddingStore } from './embeddingStore';
import type { IEmbeddingStore } from './embeddingTypes';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'embed-idx-'));
}

describe('embeddingIndexer', () => {
  let workDir: string;
  let dbPath: string;
  let store: IEmbeddingStore;

  beforeEach(() => {
    workDir = tmpDir();
    dbPath = path.join(workDir, 'test-embeddings.db');
    store = createEmbeddingStore(dbPath);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('indexes files and stores chunks', async () => {
    const filePath = path.join(workDir, 'test.ts');
    const content = Array.from({ length: 60 }, (_, i) => `const line${i} = ${i};`).join('\n');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-controlled path under tmpdir
    fs.writeFileSync(filePath, content);
    const provider = createStubProvider(64);
    const result = await indexFiles([filePath], {
      store,
      provider,
      getNodesForFile: () => [],
    });
    expect(result.filesProcessed).toBe(1);
    expect(result.chunksIndexed).toBeGreaterThan(0);
    expect(store.getStatus().totalChunks).toBeGreaterThan(0);
  });

  it('skips unchanged chunks on re-index', async () => {
    const filePath = path.join(workDir, 'stable.ts');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-controlled path under tmpdir
    fs.writeFileSync(filePath, 'function foo() { return 1; }');
    const provider = createStubProvider(64);
    const opts = { store, provider, getNodesForFile: () => [] as never[] };
    const first = await indexFiles([filePath], opts);
    expect(first.chunksIndexed).toBeGreaterThan(0);
    const second = await indexFiles([filePath], opts);
    expect(second.chunksIndexed).toBe(0);
  });

  it('handles missing files gracefully', async () => {
    const provider = createStubProvider(64);
    const result = await indexFiles(['/nonexistent/file.ts'], {
      store,
      provider,
      getNodesForFile: () => [],
    });
    expect(result.filesProcessed).toBe(1);
    expect(result.chunksIndexed).toBe(0);
  });
});
