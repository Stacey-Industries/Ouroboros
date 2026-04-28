/**
 * analyze-ranker-hit-rate.test.ts — Wave 53b Phase A
 *
 * Unit tests for pure-function helpers in analyze-ranker-hit-rate-types.ts.
 * Covers: XML parsing, path normalization, hit-rate and recall@k computation,
 * goal bucketing (via classifyGoal), aggregation stats, and decision thresholds.
 * Does NOT invoke the actual script against the real corpus.
 */

import { describe, expect, it } from 'vitest';

import {
  applyDecision,
  bucketLabel,
  buildSessionMetrics,
  collectTopMisses,
  computeBucketStats,
  computeHitRate,
  computeRecallAtK,
  extractGoalText,
  extractReadPaths,
  extractStringContent,
  mean,
  median,
  normalizePath,
  parseRelevantCodeFiles,
} from './analyze-ranker-hit-rate-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FILE_A = 'C:\\Web App\\Agent IDE\\src\\main\\foo.ts';
const FILE_B = 'C:\\Web App\\Agent IDE\\src\\main\\bar.ts';
const FILE_C = 'C:\\Web App\\Agent IDE\\src\\renderer\\baz.tsx';
const FILE_D = 'C:\\Web App\\Agent IDE\\src\\renderer\\qux.tsx';

function makeRelevantCodeBlock(files: { path: string; score: number }[]): string {
  const tags = files
    .map((f) => `<file path="${f.path}" score="${f.score}" confidence="medium" reasons="git_diff">`)
    .join('\n');
  return `<relevant_code>\n${tags}\n</relevant_code>`;
}

function makeUserContent(goal: string, files: { path: string; score: number }[]): string {
  return `${goal}\n\n<ide_context>\n${makeRelevantCodeBlock(files)}\n</ide_context>`;
}

// ─── parseRelevantCodeFiles ───────────────────────────────────────────────────

describe('parseRelevantCodeFiles', () => {
  it('returns empty array when no relevant_code block', () => {
    expect(parseRelevantCodeFiles('hello world')).toEqual([]);
  });

  it('returns empty array when block is empty', () => {
    expect(parseRelevantCodeFiles('<relevant_code>\n</relevant_code>')).toEqual([]);
  });

  it('parses a single file entry', () => {
    const content = makeRelevantCodeBlock([{ path: FILE_A, score: 56 }]);
    const files = parseRelevantCodeFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(FILE_A);
    expect(files[0].score).toBe(56);
    expect(files[0].confidence).toBe('medium');
    expect(files[0].reasons).toBe('git_diff');
  });

  it('preserves order and parses multiple entries', () => {
    const content = makeRelevantCodeBlock([
      { path: FILE_A, score: 100 },
      { path: FILE_B, score: 56 },
      { path: FILE_C, score: 22 },
    ]);
    const files = parseRelevantCodeFiles(content);
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path)).toEqual([FILE_A, FILE_B, FILE_C]);
    expect(files.map((f) => f.score)).toEqual([100, 56, 22]);
  });

  it('handles malformed score gracefully (NaN → 0)', () => {
    const block = `<relevant_code><file path="${FILE_A}" score="bad" confidence="low" reasons="x"></relevant_code>`;
    const files = parseRelevantCodeFiles(block);
    expect(files[0].score).toBe(0);
  });
});

// ─── extractGoalText ──────────────────────────────────────────────────────────

describe('extractGoalText', () => {
  it('returns text before <ide_context>', () => {
    const content = 'Fix the bug\n\n<ide_context>...\n</ide_context>';
    expect(extractGoalText(content)).toBe('Fix the bug');
  });

  it('returns trimmed full content when no <ide_context>', () => {
    expect(extractGoalText('  hello  ')).toBe('hello');
  });

  it('truncates to 500 chars when no <ide_context> tag', () => {
    const long = 'x'.repeat(600);
    expect(extractGoalText(long)).toHaveLength(500);
  });
});

// ─── normalizePath ────────────────────────────────────────────────────────────

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\foo\\bar.ts')).toBe('c:/foo/bar.ts');
  });

  it('lowercases the result', () => {
    expect(normalizePath('/Src/Main/Foo.ts')).toBe('/src/main/foo.ts');
  });

  it('is idempotent', () => {
    const p = 'c:/src/main/foo.ts';
    expect(normalizePath(normalizePath(p))).toBe(p);
  });
});

// ─── computeHitRate ───────────────────────────────────────────────────────────

describe('computeHitRate', () => {
  it('returns 0 for empty preLoaded list', () => {
    expect(computeHitRate([], new Set(['c:/foo.ts']))).toBe(0);
  });

  it('returns 1 when all pre-loaded files were Read', () => {
    const files = parseRelevantCodeFiles(makeRelevantCodeBlock([{ path: FILE_A, score: 1 }, { path: FILE_B, score: 1 }]));
    const reads = new Set([normalizePath(FILE_A), normalizePath(FILE_B)]);
    expect(computeHitRate(files, reads)).toBe(1);
  });

  it('returns 0 when no pre-loaded files were Read', () => {
    const files = parseRelevantCodeFiles(makeRelevantCodeBlock([{ path: FILE_A, score: 1 }]));
    expect(computeHitRate(files, new Set())).toBe(0);
  });

  it('returns 0.5 for a 1-of-2 hit', () => {
    const files = parseRelevantCodeFiles(makeRelevantCodeBlock([{ path: FILE_A, score: 1 }, { path: FILE_B, score: 1 }]));
    const reads = new Set([normalizePath(FILE_A)]);
    expect(computeHitRate(files, reads)).toBe(0.5);
  });
});

// ─── computeRecallAtK ────────────────────────────────────────────────────────

describe('computeRecallAtK', () => {
  const files = parseRelevantCodeFiles(makeRelevantCodeBlock([
    { path: FILE_A, score: 4 },
    { path: FILE_B, score: 3 },
    { path: FILE_C, score: 2 },
    { path: FILE_D, score: 1 },
  ]));

  it('returns 0 for empty preLoaded list', () => {
    expect(computeRecallAtK([], new Set(), 5)).toBe(0);
  });

  it('recall@1 = 1 when rank-1 file was Read', () => {
    const reads = new Set([normalizePath(FILE_A)]);
    expect(computeRecallAtK(files, reads, 1)).toBe(1);
  });

  it('recall@1 = 0 when rank-1 file was NOT Read', () => {
    const reads = new Set([normalizePath(FILE_B)]);
    expect(computeRecallAtK(files, reads, 1)).toBe(0);
  });

  it('recall@3 counts hits within top 3 only', () => {
    const reads = new Set([normalizePath(FILE_A), normalizePath(FILE_C)]);
    expect(computeRecallAtK(files, reads, 3)).toBeCloseTo(2 / 3);
  });

  it('k larger than list uses full list length as denominator', () => {
    const reads = new Set([normalizePath(FILE_A)]);
    expect(computeRecallAtK(files, reads, 10)).toBe(1 / 4);
  });
});

// ─── mean / median ───────────────────────────────────────────────────────────

describe('mean', () => {
  it('returns 0 for empty', () => expect(mean([])).toBe(0));
  it('returns single value', () => expect(mean([0.6])).toBe(0.6));
  it('averages correctly', () => expect(mean([0, 0.5, 1])).toBeCloseTo(0.5));
});

describe('median', () => {
  it('returns 0 for empty', () => expect(median([])).toBe(0));
  it('middle value for odd length', () => expect(median([0.1, 0.5, 0.9])).toBe(0.5));
  it('average of two middle values for even length', () => expect(median([0.2, 0.4, 0.6, 0.8])).toBe(0.5));
  it('sorts before picking median', () => expect(median([0.9, 0.1, 0.5])).toBe(0.5));
});

// ─── bucketLabel ─────────────────────────────────────────────────────────────

describe('bucketLabel', () => {
  it('maps 0 → 0-20%', () => expect(bucketLabel(0)).toBe('0-20%'));
  it('maps 0.19 → 0-20%', () => expect(bucketLabel(0.19)).toBe('0-20%'));
  it('maps 0.2 → 20-40%', () => expect(bucketLabel(0.2)).toBe('20-40%'));
  it('maps 0.5 → 40-60%', () => expect(bucketLabel(0.5)).toBe('40-60%'));
  it('maps 0.8 → 80-100%', () => expect(bucketLabel(0.8)).toBe('80-100%'));
  it('maps 1.0 → 80-100%', () => expect(bucketLabel(1.0)).toBe('80-100%'));
});

// ─── applyDecision ───────────────────────────────────────────────────────────

describe('applyDecision', () => {
  it('≥70% → no-change', () => expect(applyDecision(0.7)).toBe('no-change'));
  it('100% → no-change', () => expect(applyDecision(1.0)).toBe('no-change'));
  it('40% → tune', () => expect(applyDecision(0.4)).toBe('tune'));
  it('69.9% → tune', () => expect(applyDecision(0.699)).toBe('tune'));
  it('<40% → redesign', () => expect(applyDecision(0.39)).toBe('redesign'));
  it('0% → redesign', () => expect(applyDecision(0)).toBe('redesign'));
});

// ─── computeBucketStats ──────────────────────────────────────────────────────

describe('computeBucketStats', () => {
  it('returns zero stats for empty session list', () => {
    const stats = computeBucketStats([]);
    expect(stats.count).toBe(0);
    expect(stats.meanHitRate).toBe(0);
  });

  it('anyHitRate reflects fraction with anyHit=true', () => {
    const content = makeUserContent('fix bug', [
      { path: FILE_A, score: 56 },
      { path: FILE_B, score: 32 },
      { path: FILE_C, score: 22 },
    ]);
    const readsHit = new Set([normalizePath(FILE_A)]);
    const readsMiss = new Set([normalizePath(FILE_D)]); // 1 read, no overlap with preLoaded
    const s1 = buildSessionMetrics('s1', content, readsHit)!;
    const s2 = buildSessionMetrics('s2', content, readsMiss)!;
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    const stats = computeBucketStats([s1, s2]);
    expect(stats.anyHitRate).toBe(0.5);
  });
});

// ─── extractStringContent ────────────────────────────────────────────────────

describe('extractStringContent', () => {
  it('returns null for object without message', () => {
    expect(extractStringContent({ type: 'system' })).toBeNull();
  });

  it('returns string content directly', () => {
    const obj = { message: { role: 'user', content: 'hello' } };
    expect(extractStringContent(obj)).toBe('hello');
  });

  it('extracts text block from content array', () => {
    const obj = { message: { content: [{ type: 'text', text: 'world' }] } };
    expect(extractStringContent(obj)).toBe('world');
  });

  it('extracts string from tool_result content', () => {
    const obj = { message: { content: [{ type: 'tool_result', content: 'result text' }] } };
    expect(extractStringContent(obj)).toBe('result text');
  });
});

// ─── extractReadPaths ────────────────────────────────────────────────────────

describe('extractReadPaths', () => {
  it('returns empty for non-assistant message', () => {
    expect(extractReadPaths({ message: { content: 'hi' } })).toEqual([]);
  });

  it('extracts file_path from Read tool_use blocks', () => {
    const obj = {
      message: {
        content: [
          { type: 'tool_use', name: 'Read', input: { file_path: FILE_A } },
          { type: 'tool_use', name: 'Grep', input: { pattern: 'foo' } },
          { type: 'tool_use', name: 'Read', input: { file_path: FILE_B } },
        ],
      },
    };
    expect(extractReadPaths(obj)).toEqual([FILE_A, FILE_B]);
  });

  it('ignores Read blocks without file_path', () => {
    const obj = { message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } };
    expect(extractReadPaths(obj)).toEqual([]);
  });
});

// ─── buildSessionMetrics ─────────────────────────────────────────────────────

describe('buildSessionMetrics', () => {
  it('returns null when preLoadedCount < 3', () => {
    const content = makeUserContent('fix', [{ path: FILE_A, score: 56 }, { path: FILE_B, score: 32 }]);
    expect(buildSessionMetrics('s1', content, new Set([normalizePath(FILE_A)]))).toBeNull();
  });

  it('returns null when totalReads < 1', () => {
    const content = makeUserContent('fix', [
      { path: FILE_A, score: 56 }, { path: FILE_B, score: 32 }, { path: FILE_C, score: 22 },
    ]);
    expect(buildSessionMetrics('s1', content, new Set())).toBeNull();
  });

  it('computes correct hitRate and recallAt1 for full-hit session', () => {
    const files = [
      { path: FILE_A, score: 56 },
      { path: FILE_B, score: 32 },
      { path: FILE_C, score: 22 },
    ];
    const content = makeUserContent('implement feature X in src/main/foo.ts', files);
    const reads = new Set(files.map((f) => normalizePath(f.path)));
    const metrics = buildSessionMetrics('s1', content, reads)!;
    expect(metrics.hitRate).toBe(1);
    expect(metrics.recallAt1).toBe(1);
    expect(metrics.anyHit).toBe(true);
    expect(metrics.goalBucket).toBe('code');
  });

  it('computes correct hitRate for zero-hit session', () => {
    const files = [
      { path: FILE_A, score: 56 }, { path: FILE_B, score: 32 }, { path: FILE_C, score: 22 },
    ];
    const content = makeUserContent('implement feature', files);
    const reads = new Set([normalizePath(FILE_D)]);
    const metrics = buildSessionMetrics('s1', content, reads)!;
    expect(metrics.hitRate).toBe(0);
    expect(metrics.anyHit).toBe(false);
  });
});

// ─── collectTopMisses ────────────────────────────────────────────────────────

describe('collectTopMisses', () => {
  it('returns empty for empty session list', () => {
    expect(collectTopMisses([])).toEqual([]);
  });

  it('returns at most SAMPLE_MISS_LIMIT entries', () => {
    const files = [
      { path: FILE_A, score: 56 }, { path: FILE_B, score: 32 }, { path: FILE_C, score: 22 },
    ];
    const content = makeUserContent('implement', files);
    const reads = new Set<string>();
    const sessions = Array.from({ length: 10 }, (_, i) => buildSessionMetrics(`s${i}`, content, reads)!).filter(Boolean);
    const misses = collectTopMisses(sessions);
    expect(misses.length).toBeLessThanOrEqual(5);
  });
});
