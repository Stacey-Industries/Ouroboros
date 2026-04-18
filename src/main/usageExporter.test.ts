/**
 * usageExporter.test.ts — Wave 37 Phase C
 *
 * Tests for exportUsage():
 *  - window filtering (inclusive bounds)
 *  - JSONL format (each line independently parseable as JSON)
 *  - missing parent directory → error (no silent mkdir)
 *  - empty window → 0 rows, empty file
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CostEntry } from './costHistory';
import { exportUsage } from './usageExporter';

// ─── Mock costHistory ────────────────────────────────────────────────────────

vi.mock('./costHistory', () => ({
  getCostHistory: vi.fn(),
}));

import { getCostHistory } from './costHistory';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<CostEntry>): CostEntry {
  return {
    date: '2026-04-17',
    sessionId: 'sess-1',
    taskLabel: 'test task',
    model: 'claude-sonnet-4-6',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    estimatedCost: 0.002,
    timestamp: Date.now(),
    ...overrides,
  };
}

const T0 = 1_000_000;
const T1 = T0 + 1000;
const T2 = T0 + 2000;
const T3 = T0 + 3000;

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let outFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-exporter-test-'));
  outFile = path.join(tmpDir, 'export.jsonl');
});

afterEach(async () => {
  vi.resetAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('exportUsage — window filtering', () => {
  it('includes entries within [windowStart, windowEnd] inclusive', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([
      makeEntry({ sessionId: 'a', timestamp: T0 }),
      makeEntry({ sessionId: 'b', timestamp: T1 }),
      makeEntry({ sessionId: 'c', timestamp: T2 }),
      makeEntry({ sessionId: 'd', timestamp: T3 }),
    ]);

    const result = await exportUsage({ windowStart: T1, windowEnd: T2, outputPath: outFile });

    expect(result.rowsWritten).toBe(2);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- outFile is a test-controlled tmp path
    const content = await fs.readFile(outFile, 'utf-8');
    const lines = content.trim().split('\n');
    const ids = lines.map((l) => JSON.parse(l).sessionId);
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('d');
  });

  it('empty window produces 0 rows and empty file content', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([
      makeEntry({ timestamp: T0 }),
      makeEntry({ timestamp: T3 }),
    ]);

    const result = await exportUsage({ windowStart: T1, windowEnd: T2, outputPath: outFile });

    expect(result.rowsWritten).toBe(0);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- outFile is a test-controlled tmp path
    const content = await fs.readFile(outFile, 'utf-8');
    expect(content).toBe('');
  });
});

describe('exportUsage — JSONL format', () => {
  it('writes one JSON object per line, each independently parseable', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([
      makeEntry({ sessionId: 'x', timestamp: T1 }),
      makeEntry({ sessionId: 'y', timestamp: T2 }),
    ]);

    await exportUsage({ windowStart: T1, windowEnd: T2, outputPath: outFile });

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- outFile is a test-controlled tmp path
    const content = await fs.readFile(outFile, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('each row has required fields', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([
      makeEntry({ sessionId: 'z', timestamp: T1, model: 'claude-opus-4-7' }),
    ]);

    await exportUsage({ windowStart: T1, windowEnd: T1, outputPath: outFile });

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- outFile is a test-controlled tmp path
    const content = await fs.readFile(outFile, 'utf-8');
    const row = JSON.parse(content.trim());
    expect(row.sessionId).toBe('z');
    expect(row.provider).toBe('claude');
    expect(row.model).toBe('claude-opus-4-7');
    expect(typeof row.timestamp).toBe('string');
    expect(new Date(row.timestamp).toISOString()).toBe(row.timestamp);
  });

  it('returns the resolved path in the result', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([]);

    const result = await exportUsage({ windowStart: T1, windowEnd: T2, outputPath: outFile });

    expect(result.path).toBe(outFile);
  });
});

describe('exportUsage — path validation', () => {
  it('rejects a relative path', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([]);

    await expect(
      exportUsage({ windowStart: T1, windowEnd: T2, outputPath: 'relative/path.jsonl' }),
    ).rejects.toThrow(/absolute/i);
  });

  it('rejects when parent directory does not exist', async () => {
    vi.mocked(getCostHistory).mockResolvedValue([]);
    const nonExistent = path.join(tmpDir, 'does-not-exist', 'export.jsonl');

    await expect(
      exportUsage({ windowStart: T1, windowEnd: T2, outputPath: nonExistent }),
    ).rejects.toThrow(/does not exist/i);
  });
});
