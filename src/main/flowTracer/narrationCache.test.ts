/**
 * narrationCache.test.ts — Unit + integration tests for the per-symbol
 * What+How narration cache (Wave 85 Phase 3).
 *
 * spawnClaude is mocked — no real Haiku calls in CI.
 * fs is mocked — no real disk I/O.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SymbolRef } from '../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Mocks (declared before imports that consume them)
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn((key: string) => {
    if (key === 'defaultProjectRoot') return '/tmp/test-workspace';
    return undefined;
  }),
}));

const mockSpawnClaude = vi.fn<[string, string], Promise<string>>();
vi.mock('../claudeMdGeneratorSupport', () => ({
  spawnClaude: (...args: [string, string]) => mockSpawnClaude(...args),
}));

// fs mock — in-memory file store
const fakeFs = new Map<string, string>();
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async (p: string) => {
      const content = fakeFs.get(p);
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return content;
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      fakeFs.set(p, data);
    }),
    unlink: vi.fn(async (p: string) => {
      if (!fakeFs.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      fakeFs.delete(p);
    }),
  },
}));

// ---------------------------------------------------------------------------
// Subject under test (imported after mocks)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
import path from 'path';

import {
  batchGenerateNarrations,
  computeSymbolHash,
  generateNarration,
  getCircuitBreakerState,
  getNarration,
  invalidateNarration,
  resetCircuitBreaker,
} from './narrationCache';
import { WHY_PLACEHOLDER } from './narrationCachePrompt';

const WORKSPACE = '/tmp/test-workspace';
// Use path.join so cache-dir comparisons match the OS separator used by the module.
const CACHE_DIR = path.join(WORKSPACE, '.ouroboros', 'narration-cache');

function makeRef(symbol: string, file = 'src/foo.ts', line = 1): SymbolRef {
  return { symbol, file, line };
}

function cannedResponse(symbol: string): string {
  return JSON.stringify([
    {
      symbol,
      what: `What for ${symbol}.`,
      why: WHY_PLACEHOLDER,
      how: `How for ${symbol}.`,
    },
  ]);
}

// ---------------------------------------------------------------------------
// computeSymbolHash — determinism + invalidation
// ---------------------------------------------------------------------------

describe('computeSymbolHash', () => {
  it('returns the same hash for identical inputs', () => {
    const ref = makeRef('myFn');
    expect(computeSymbolHash(ref, 'body')).toBe(computeSymbolHash(ref, 'body'));
  });

  it('returns a different hash when body changes', () => {
    const ref = makeRef('myFn');
    expect(computeSymbolHash(ref, 'body v1')).not.toBe(computeSymbolHash(ref, 'body v2'));
  });

  it('returns a different hash when file changes', () => {
    const a = makeRef('myFn', 'src/a.ts');
    const b = makeRef('myFn', 'src/b.ts');
    expect(computeSymbolHash(a, 'body')).not.toBe(computeSymbolHash(b, 'body'));
  });

  it('returns a different hash when line changes', () => {
    const a = makeRef('myFn', 'src/a.ts', 1);
    const b = makeRef('myFn', 'src/a.ts', 99);
    expect(computeSymbolHash(a, 'body')).not.toBe(computeSymbolHash(b, 'body'));
  });

  it('produces a 40-char hex string (SHA1)', () => {
    const hash = computeSymbolHash(makeRef('fn'), 'body');
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

describe('circuit breaker', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    fakeFs.clear();
  });

  afterEach(() => {
    resetCircuitBreaker();
    mockSpawnClaude.mockReset();
  });

  it('starts closed', () => {
    expect(getCircuitBreakerState()).toEqual({ open: false, failures: 0 });
  });

  it('opens after 3 consecutive failures', async () => {
    mockSpawnClaude.mockRejectedValue(new Error('CLI down'));
    const ref = makeRef('brokenFn');

    // Three calls each fail twice (2 attempts each) → 3 consecutive failures
    await generateNarration(ref);
    await generateNarration(ref);
    await generateNarration(ref);

    expect(getCircuitBreakerState().open).toBe(true);
  });

  it('resets after a success', async () => {
    mockSpawnClaude.mockRejectedValue(new Error('CLI down'));
    const ref = makeRef('failFn');
    await generateNarration(ref);
    await generateNarration(ref);
    expect(getCircuitBreakerState().failures).toBeGreaterThan(0);

    // Successful call resets counter
    mockSpawnClaude.mockResolvedValue(cannedResponse('failFn'));
    await generateNarration(ref);
    expect(getCircuitBreakerState()).toEqual({ open: false, failures: 0 });
  });

  it('skips generation when circuit is open', async () => {
    // Force circuit open
    mockSpawnClaude.mockRejectedValue(new Error('down'));
    const ref = makeRef('gatedFn');
    await generateNarration(ref);
    await generateNarration(ref);
    await generateNarration(ref);
    expect(getCircuitBreakerState().open).toBe(true);

    mockSpawnClaude.mockClear();
    const result = await generateNarration(ref);
    expect(result).toBeNull();
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getNarration — cache round-trip
// ---------------------------------------------------------------------------

describe('getNarration — cache round-trip', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    fakeFs.clear();
    mockSpawnClaude.mockReset();
  });

  it('returns null on cache miss', async () => {
    const result = await getNarration(makeRef('unknownFn'));
    expect(result).toBeNull();
  });

  it('returns cached narration on cache hit', async () => {
    const ref = makeRef('cachedFn');
    mockSpawnClaude.mockResolvedValue(cannedResponse('cachedFn'));

    // Populate cache via generateNarration
    await generateNarration(ref);

    // getNarration should now find it
    const result = await getNarration(ref);
    expect(result).not.toBeNull();
    expect((result as { what: string }).what).toBe('What for cachedFn.');
  });

  it('returns the narration with all three fields', async () => {
    const ref = makeRef('fullFn');
    mockSpawnClaude.mockResolvedValue(cannedResponse('fullFn'));
    await generateNarration(ref);

    const result = await getNarration(ref);
    expect(result).toMatchObject({
      what: 'What for fullFn.',
      why: WHY_PLACEHOLDER,
      how: 'How for fullFn.',
    });
  });

  it('returns null when workspace root is unavailable', async () => {
    const { getConfigValue } = await import('../config');
    vi.mocked(getConfigValue).mockReturnValueOnce(undefined as unknown as string);
    const result = await getNarration(makeRef('anyFn'));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateNarration — write to cache
// ---------------------------------------------------------------------------

describe('generateNarration', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    fakeFs.clear();
    mockSpawnClaude.mockReset();
  });

  it('calls spawnClaude and returns a narration', async () => {
    mockSpawnClaude.mockResolvedValue(cannedResponse('newFn'));
    const result = await generateNarration(makeRef('newFn'));
    expect(result).not.toBeNull();
    expect(result?.what).toBe('What for newFn.');
    expect(mockSpawnClaude).toHaveBeenCalledOnce();
  });

  it('writes the narration to the cache file', async () => {
    const ref = makeRef('writtenFn', 'src/bar.ts', 5);
    mockSpawnClaude.mockResolvedValue(cannedResponse('writtenFn'));

    // Seed source body that fetchSymbolBody will read
    const body = 'function writtenFn() {}';
    // Use path.join so the key matches path.join(workspaceRoot, ref.file) in the module.
    fakeFs.set(path.join(WORKSPACE, 'src', 'bar.ts'), `\n\n\n\n${body}`); // line 5 starts

    await generateNarration(ref);

    // At least one .json file should be written in the cache dir
    const writtenPaths = [...fakeFs.keys()].filter((k) => k.startsWith(CACHE_DIR));
    expect(writtenPaths.length).toBeGreaterThan(0);
  });

  it('does not call spawnClaude when cache is already populated', async () => {
    const ref = makeRef('doubleFn');
    mockSpawnClaude.mockResolvedValue(cannedResponse('doubleFn'));

    await generateNarration(ref); // first call — populates cache
    mockSpawnClaude.mockClear();

    await generateNarration(ref); // second call — should hit cache
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });

  it('retries once on parse failure then returns null', async () => {
    mockSpawnClaude.mockResolvedValue('not json at all');
    const result = await generateNarration(makeRef('badFn'));
    expect(result).toBeNull();
    expect(mockSpawnClaude).toHaveBeenCalledTimes(2); // 2 attempts
  });

  it('returns null when spawnClaude throws on all attempts', async () => {
    mockSpawnClaude.mockRejectedValue(new Error('subprocess failed'));
    const result = await generateNarration(makeRef('errFn'));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// invalidateNarration
// ---------------------------------------------------------------------------

describe('invalidateNarration', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    fakeFs.clear();
    mockSpawnClaude.mockReset();
  });

  it('deletes the cache file for the symbol', async () => {
    const ref = makeRef('toInvalidate', 'src/mod.ts', 1);
    mockSpawnClaude.mockResolvedValue(cannedResponse('toInvalidate'));
    fakeFs.set(path.join(WORKSPACE, 'src', 'mod.ts'), 'function toInvalidate() {}');

    await generateNarration(ref);
    const before = [...fakeFs.keys()].filter((k) => k.startsWith(CACHE_DIR));
    expect(before.length).toBeGreaterThan(0);

    await invalidateNarration(ref);
    const after = [...fakeFs.keys()].filter((k) => k.startsWith(CACHE_DIR));
    expect(after.length).toBe(0);
  });

  it('does not throw when the cache file does not exist', async () => {
    await expect(invalidateNarration(makeRef('missing'))).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// batchGenerateNarrations — concurrency + deduplication
// ---------------------------------------------------------------------------

describe('batchGenerateNarrations', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    fakeFs.clear();
    mockSpawnClaude.mockReset();
  });

  it('returns immediately for empty input', async () => {
    await expect(batchGenerateNarrations([])).resolves.not.toThrow();
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });

  it('calls spawnClaude for uncached symbols', async () => {
    const refs = [makeRef('alpha'), makeRef('beta')];
    mockSpawnClaude.mockResolvedValue(
      JSON.stringify([
        { symbol: 'alpha', what: 'W alpha.', why: WHY_PLACEHOLDER, how: 'H alpha.' },
        { symbol: 'beta', what: 'W beta.', why: WHY_PLACEHOLDER, how: 'H beta.' },
      ]),
    );
    await batchGenerateNarrations(refs);
    expect(mockSpawnClaude).toHaveBeenCalled();
  });

  it('skips already-cached symbols', async () => {
    const ref = makeRef('preCached');
    mockSpawnClaude.mockResolvedValue(cannedResponse('preCached'));

    // Populate cache first
    await generateNarration(ref);
    mockSpawnClaude.mockClear();

    // Batch should skip it
    await batchGenerateNarrations([ref]);
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });
});
