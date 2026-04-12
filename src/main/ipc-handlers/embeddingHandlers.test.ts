import { describe, expect, it } from 'vitest';

describe('embeddingHandlers', () => {
  it('module exports registerEmbeddingHandlers', async () => {
    const mod = await import('./embeddingHandlers');
    expect(typeof mod.registerEmbeddingHandlers).toBe('function');
    expect(typeof mod.closeEmbeddingStore).toBe('function');
  });
});
