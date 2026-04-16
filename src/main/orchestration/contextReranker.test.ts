/**
 * contextReranker.test.ts — Unit tests for buildRerankPrompt, parseRerankedOrder,
 * and rerankCandidates.
 *
 * The spawnHaikuForRerank helper is mocked — the real Claude CLI is never invoked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./contextRerankerSpawn', () => ({
  spawnHaikuForRerank: vi.fn(),
}));

vi.mock('../config', () => ({
  store: { get: vi.fn(), set: vi.fn(), onDidChange: vi.fn(() => ({ dispose: vi.fn() })) },
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

import log from '../logger';
import {
  buildRerankPrompt,
  parseRerankedOrder,
  rerankCandidates,
} from './contextReranker';
import { spawnHaikuForRerank } from './contextRerankerSpawn';

const mockSpawn = vi.mocked(spawnHaikuForRerank);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCandidates(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    path: `src/file${i}.ts`,
    snippetPreview: `content of file ${i}`.repeat(5),
  }));
}

// ─── buildRerankPrompt ─────────────────────────────────────────────────────────

describe('buildRerankPrompt', () => {
  it('includes the user goal in the prompt', () => {
    const prompt = buildRerankPrompt('fix the login bug', makeCandidates(2));
    expect(prompt).toContain('fix the login bug');
  });

  it('lists each candidate path', () => {
    const candidates = makeCandidates(3);
    const prompt = buildRerankPrompt('goal', candidates);
    for (const c of candidates) {
      expect(prompt).toContain(c.path);
    }
  });

  it('instructs the model to return JSON with an order array', () => {
    const prompt = buildRerankPrompt('goal', makeCandidates(2));
    expect(prompt).toContain('"order"');
    expect(prompt).toContain('Return JSON');
  });

  it('caps snippet previews at 200 characters', () => {
    const longContent = 'x'.repeat(500);
    const candidates = [{ path: 'a.ts', snippetPreview: longContent }];
    const prompt = buildRerankPrompt('goal', candidates);
    // The truncated preview should appear in the prompt (200 x's)
    expect(prompt).toContain('x'.repeat(200));
    expect(prompt).not.toContain('x'.repeat(201));
  });

  it('numbers candidates starting at 1', () => {
    const prompt = buildRerankPrompt('goal', makeCandidates(3));
    expect(prompt).toMatch(/^1\. /m);
    expect(prompt).toMatch(/^2\. /m);
    expect(prompt).toMatch(/^3\. /m);
  });
});

// ─── parseRerankedOrder ────────────────────────────────────────────────────────

describe('parseRerankedOrder', () => {
  const originals = ['src/a.ts', 'src/b.ts', 'src/c.ts'];

  it('extracts order from clean JSON output', () => {
    const output = '{"order": ["src/b.ts", "src/a.ts", "src/c.ts"]}';
    const result = parseRerankedOrder(output, originals);
    expect(result).toEqual(['src/b.ts', 'src/a.ts', 'src/c.ts']);
  });

  it('extracts JSON wrapped in markdown fences', () => {
    const output = '```json\n{"order": ["src/c.ts", "src/a.ts"]}\n```';
    const result = parseRerankedOrder(output, originals);
    expect(result).toEqual(['src/c.ts', 'src/a.ts']);
  });

  it('extracts JSON with surrounding prose', () => {
    const output = 'Here is the ranking:\n{"order": ["src/a.ts", "src/b.ts"]}\nHope that helps.';
    const result = parseRerankedOrder(output, originals);
    expect(result).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('filters out paths not in the original set', () => {
    const output = '{"order": ["src/a.ts", "src/unknown.ts", "src/b.ts"]}';
    const result = parseRerankedOrder(output, originals);
    expect(result).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns null when output has no JSON', () => {
    expect(parseRerankedOrder('no json here', originals)).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    expect(parseRerankedOrder('{order: [broken}', originals)).toBeNull();
  });

  it('returns null when order array is missing', () => {
    expect(parseRerankedOrder('{"files": ["src/a.ts"]}', originals)).toBeNull();
  });

  it('returns null when no returned paths overlap with originals', () => {
    const output = '{"order": ["src/other.ts", "src/nowhere.ts"]}';
    expect(parseRerankedOrder(output, originals)).toBeNull();
  });

  it('returns null when order is not an array', () => {
    expect(parseRerankedOrder('{"order": "src/a.ts"}', originals)).toBeNull();
  });
});

// ─── rerankCandidates ─────────────────────────────────────────────────────────

describe('rerankCandidates — threshold guard', () => {
  it('returns candidates unchanged when count < 15', async () => {
    const candidates = makeCandidates(14);
    const result = await rerankCandidates('goal', candidates);
    expect(result).toBe(candidates); // same reference — no copy
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('proceeds with reranking when count === 15', async () => {
    mockSpawn.mockResolvedValueOnce({
      success: true,
      output: `{"order": ${JSON.stringify(makeCandidates(15).map((c) => c.path))}}`,
      latencyMs: 80,
    });
    const candidates = makeCandidates(15);
    await rerankCandidates('goal', candidates);
    expect(mockSpawn).toHaveBeenCalledOnce();
  });
});

describe('rerankCandidates — successful rerank', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('reorders candidates according to the returned order', async () => {
    const candidates = makeCandidates(16);
    const reversedPaths = [...candidates].reverse().map((c) => c.path);
    mockSpawn.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify({ order: reversedPaths }),
      latencyMs: 90,
    });

    const result = await rerankCandidates('goal', candidates);
    expect(result.map((c) => c.path)).toEqual(reversedPaths);
  });

  it('appends unmentioned candidates after the ranked ones', async () => {
    const candidates = makeCandidates(17);
    // Only return order for first 15 — file15.ts and file16.ts are unmentioned
    const partialOrder = candidates.slice(0, 15).reverse().map((c) => c.path);
    mockSpawn.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify({ order: partialOrder }),
      latencyMs: 70,
    });

    const result = await rerankCandidates('goal', candidates);
    // First 15 slots are the reranked paths
    expect(result.slice(0, 15).map((c) => c.path)).toEqual(partialOrder);
    // Remaining 2 are the unmentioned ones in original order
    expect(result[15].path).toBe('src/file15.ts');
    expect(result[16].path).toBe('src/file16.ts');
  });

  it('passes the correct timeoutMs to spawnHaikuForRerank', async () => {
    mockSpawn.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify({ order: makeCandidates(15).map((c) => c.path) }),
      latencyMs: 60,
    });
    await rerankCandidates('goal', makeCandidates(15), { timeoutMs: 800 });
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      800,
    );
  });
});

describe('rerankCandidates — fallback paths', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns original candidates on spawn failure (timeout)', async () => {
    mockSpawn.mockResolvedValueOnce({
      success: false,
      error: 'timeout',
      latencyMs: 501,
    });
    const candidates = makeCandidates(16);
    const result = await rerankCandidates('goal', candidates);
    expect(result).toBe(candidates);
    expect(vi.mocked(log.warn)).toHaveBeenCalled();
  });

  it('returns original candidates on non-zero exit', async () => {
    mockSpawn.mockResolvedValueOnce({
      success: false,
      error: 'exit 1: auth error',
      latencyMs: 200,
    });
    const candidates = makeCandidates(16);
    const result = await rerankCandidates('goal', candidates);
    expect(result).toBe(candidates);
  });

  it('returns original candidates when JSON parse fails', async () => {
    mockSpawn.mockResolvedValueOnce({
      success: true,
      output: 'not json at all',
      latencyMs: 100,
    });
    const candidates = makeCandidates(16);
    const result = await rerankCandidates('goal', candidates);
    expect(result).toBe(candidates);
    expect(vi.mocked(log.warn)).toHaveBeenCalled();
  });

  it('returns original candidates when returned paths have no overlap', async () => {
    mockSpawn.mockResolvedValueOnce({
      success: true,
      output: '{"order": ["completely/different.ts"]}',
      latencyMs: 100,
    });
    const candidates = makeCandidates(16);
    const result = await rerankCandidates('goal', candidates);
    expect(result).toBe(candidates);
  });

  it('returns original candidates when spawn throws unexpectedly', async () => {
    mockSpawn.mockRejectedValueOnce(new Error('spawn threw'));
    const candidates = makeCandidates(16);
    const result = await rerankCandidates('goal', candidates);
    expect(result).toBe(candidates);
    expect(vi.mocked(log.warn)).toHaveBeenCalled();
  });

  it('never throws — always resolves', async () => {
    mockSpawn.mockRejectedValueOnce(new Error('catastrophic'));
    const candidates = makeCandidates(20);
    await expect(rerankCandidates('goal', candidates)).resolves.toBeDefined();
  });
});
