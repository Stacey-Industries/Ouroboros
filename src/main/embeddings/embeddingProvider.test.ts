import { describe, expect, it } from 'vitest';

import { createLocalOnnxProvider, createProvider, createStubProvider } from './embeddingProvider';

describe('embeddingProvider', () => {
  it('stub returns zero vectors of correct dimensions', async () => {
    const provider = createStubProvider(128);
    expect(provider.model).toBe('stub');
    expect(provider.dimensions).toBe(128);
    const results = await provider.embed(['hello', 'world']);
    expect(results).toHaveLength(2);
    expect(results[0].length).toBe(128);
    expect(results[0].every((v) => v === 0)).toBe(true);
  });

  it('stub embeds empty array as empty array', async () => {
    const provider = createStubProvider();
    const results = await provider.embed([]);
    expect(results).toHaveLength(0);
  });

  it('createProvider returns local ONNX by default', () => {
    const provider = createProvider({});
    expect(provider.model).toBe('Xenova/all-MiniLM-L6-v2');
    expect(provider.dimensions).toBe(384);
  });

  it('createProvider returns stub when explicitly requested', () => {
    const provider = createProvider({ provider: 'stub' });
    expect(provider.model).toBe('stub');
  });

  it('createLocalOnnxProvider exposes correct metadata', () => {
    const provider = createLocalOnnxProvider();
    expect(provider.model).toBe('Xenova/all-MiniLM-L6-v2');
    expect(provider.dimensions).toBe(384);
    expect(typeof provider.embed).toBe('function');
  });
});
