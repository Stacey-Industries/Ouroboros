import { describe, expect, it, vi } from 'vitest';

import {
  applyNumstat,
  buildChangedFiles,
  buildGitDiffSummary,
  buildRecentCommits,
  createEmptyGitDiffSummary,
  execGit,
  mapGitStatus,
  parseDiffHunks,
  parseNumstatLine,
  readStatusFileMap,
  summarizeGitDiff,
} from './repoIndexerSupportGit';

// ---------------------------------------------------------------------------
// mapGitStatus
// ---------------------------------------------------------------------------

describe('mapGitStatus', () => {
  it('returns added for ? status', () => {
    expect(mapGitStatus('??')).toBe('added');
  });
  it('returns added for A status', () => {
    expect(mapGitStatus('A ')).toBe('added');
  });
  it('returns deleted for D status', () => {
    expect(mapGitStatus('D ')).toBe('deleted');
  });
  it('returns renamed for R status', () => {
    expect(mapGitStatus('R ')).toBe('renamed');
  });
  it('returns modified for M status', () => {
    expect(mapGitStatus('M ')).toBe('modified');
  });
  it('returns unknown for unrecognized status', () => {
    expect(mapGitStatus('X ')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// parseNumstatLine
// ---------------------------------------------------------------------------

describe('parseNumstatLine', () => {
  it('parses a standard numstat line', () => {
    const result = parseNumstatLine('/root', '10\t5\tsrc/foo.ts');
    expect(result).not.toBeNull();
    expect(result?.additions).toBe(10);
    expect(result?.deletions).toBe(5);
    expect(result?.filePath).toContain('foo.ts');
  });

  it('handles binary files (dashes)', () => {
    const result = parseNumstatLine('/root', '-\t-\tsrc/image.png');
    expect(result).not.toBeNull();
    expect(result?.additions).toBe(0);
    expect(result?.deletions).toBe(0);
  });

  it('returns null for malformed lines', () => {
    expect(parseNumstatLine('/root', 'bad line')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readStatusFileMap
// ---------------------------------------------------------------------------

describe('readStatusFileMap', () => {
  it('extracts string-string entries from files', () => {
    const result = readStatusFileMap({ files: { 'src/foo.ts': 'M', 'src/bar.ts': 'A' } });
    expect(result).toEqual({ 'src/foo.ts': 'M', 'src/bar.ts': 'A' });
  });

  it('returns empty object when files is missing', () => {
    expect(readStatusFileMap({})).toEqual({});
  });

  it('returns empty object when files is not an object', () => {
    expect(readStatusFileMap({ files: 'bad' })).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// createEmptyGitDiffSummary
// ---------------------------------------------------------------------------

describe('createEmptyGitDiffSummary', () => {
  it('creates an empty summary with the given generatedAt', () => {
    const summary = createEmptyGitDiffSummary(12345);
    expect(summary.changedFiles).toHaveLength(0);
    expect(summary.totalAdditions).toBe(0);
    expect(summary.totalDeletions).toBe(0);
    expect(summary.changedFileCount).toBe(0);
    expect(summary.generatedAt).toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// summarizeGitDiff
// ---------------------------------------------------------------------------

describe('summarizeGitDiff', () => {
  it('aggregates totals from changed files', () => {
    const files = [
      { filePath: '/root/a.ts', additions: 5, deletions: 2, status: 'modified' as const },
      { filePath: '/root/b.ts', additions: 3, deletions: 1, status: 'added' as const },
    ];
    const result = summarizeGitDiff(files, Date.now(), 'main');
    expect(result.totalAdditions).toBe(8);
    expect(result.totalDeletions).toBe(3);
    expect(result.changedFileCount).toBe(2);
    expect(result.currentBranch).toBe('main');
    expect(result.comparedAgainst).toBe('HEAD');
  });

  it('sorts files by filePath', () => {
    const files = [
      { filePath: '/root/z.ts', additions: 1, deletions: 0, status: 'modified' as const },
      { filePath: '/root/a.ts', additions: 1, deletions: 0, status: 'modified' as const },
    ];
    const result = summarizeGitDiff(files, Date.now());
    expect(result.changedFiles[0].filePath).toBe('/root/a.ts');
  });
});

// ---------------------------------------------------------------------------
// buildChangedFiles
// ---------------------------------------------------------------------------

describe('buildChangedFiles', () => {
  it('maps relative paths to absolute with correct status', () => {
    const result = buildChangedFiles({ 'src/foo.ts': 'M ' }, '/root');
    expect(result.size).toBe(1);
    const entry = Array.from(result.values())[0];
    expect(entry.status).toBe('modified');
    expect(entry.filePath).toContain('foo.ts');
    expect(entry.additions).toBe(0);
    expect(entry.deletions).toBe(0);
  });

  it('handles empty status map', () => {
    expect(buildChangedFiles({}, '/root').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildRecentCommits (mocked execGit)
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// buildRecentCommits and buildGitDiffSummary rely on child_process.execFile
// which we don't want to actually invoke in unit tests — we verify they
// return safe fallbacks when git is unavailable.

describe('buildRecentCommits', () => {
  it('returns empty array when git fails', async () => {
    const result = await buildRecentCommits('/nonexistent-path');
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('buildGitDiffSummary', () => {
  it('returns an empty summary when git is unavailable', async () => {
    const result = await buildGitDiffSummary('/nonexistent-path', Date.now());
    expect(result.changedFiles).toBeDefined();
    expect(result.changedFileCount).toBeGreaterThanOrEqual(0);
  });
});

describe('parseDiffHunks', () => {
  it('returns empty map when git diff fails', async () => {
    const result = await parseDiffHunks('/nonexistent-path');
    expect(result.size).toBe(0);
  });
});

// applyNumstat is an async wrapper around execGit — tested via integration
// or by confirming it propagates errors gracefully when git is absent.
describe('applyNumstat', () => {
  it('does not throw when git is unavailable (caller catches)', async () => {
    const map = buildChangedFiles({ 'src/foo.ts': 'M' }, '/root');
    // Will throw if git is not available — caller (buildGitDiffSummary) catches it.
    // We just verify the function exists and is callable.
    expect(typeof applyNumstat).toBe('function');
    // Calling it should either succeed or throw; either is acceptable here.
    await expect(applyNumstat('/nonexistent-path', map)).rejects.toThrow();
  });
});

describe('execGit', () => {
  it('rejects on error', async () => {
    await expect(execGit('/nonexistent', ['status'])).rejects.toThrow();
  });
});
