/**
 * jsonlRetention.test.ts — Unit tests for the shared JSONL retention helpers
 * (Wave 29.5 Phase G — M2).
 *
 * All filesystem I/O uses a real temp directory via node:fs/promises to keep
 * tests faithful to the contract. Fake timers are not needed — dates are
 * injected explicitly.
 */
/* eslint-disable security/detect-non-literal-fs-filename */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDatedFilename, migrateLegacyJsonl, purgeOlderThan } from './jsonlRetention';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-retention-test-'));
}

async function touch(dir: string, name: string, content = ''): Promise<void> {
  await fs.writeFile(path.join(dir, name), content, 'utf8');
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** Return a Date that is `daysAgo` days before today at UTC midnight. */
function utcDate(daysAgo: number): Date {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysAgo,
  ));
}

// ─── buildDatedFilename ───────────────────────────────────────────────────────

describe('buildDatedFilename', () => {
  it('returns basename-YYYY-MM-DD.jsonl using UTC date', () => {
    const d = new Date('2026-04-16T23:59:59Z');
    expect(buildDatedFilename('context-decisions', d)).toBe('context-decisions-2026-04-16.jsonl');
  });

  it('does not drift into the next local day when UTC is still the previous day', () => {
    // UTC 2026-04-16T00:30:00Z — local time in UTC+12 would be 2026-04-16T12:30
    // but UTC is what matters
    const d = new Date('2026-04-16T00:30:00Z');
    expect(buildDatedFilename('research-outcomes', d)).toBe('research-outcomes-2026-04-16.jsonl');
  });

  it('uses today UTC when no date argument supplied', () => {
    const todayStamp = new Date().toISOString().slice(0, 10);
    expect(buildDatedFilename('context-outcomes')).toBe(`context-outcomes-${todayStamp}.jsonl`);
  });

  it('handles month and day padding correctly', () => {
    const d = new Date('2026-01-05T12:00:00Z');
    expect(buildDatedFilename('my-log', d)).toBe('my-log-2026-01-05.jsonl');
  });
});

// ─── purgeOlderThan ───────────────────────────────────────────────────────────

describe('purgeOlderThan', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('removes files older than the cutoff and leaves newer ones', async () => {
    const old = buildDatedFilename('context-decisions', utcDate(31));
    const recent = buildDatedFilename('context-decisions', utcDate(0));
    await touch(tmpDir, old);
    await touch(tmpDir, recent);

    const removed = await purgeOlderThan(tmpDir, 'context-decisions', 30);

    expect(removed).toBe(1);
    const remaining = await listDir(tmpDir);
    expect(remaining).not.toContain(old);
    expect(remaining).toContain(recent);
  });

  it('leaves files exactly at the cutoff boundary (= days old, not strictly older)', async () => {
    // Exactly 30 days old — should NOT be purged (cutoff is strictly older-than)
    const boundary = buildDatedFilename('context-decisions', utcDate(30));
    await touch(tmpDir, boundary);

    const removed = await purgeOlderThan(tmpDir, 'context-decisions', 30);

    expect(removed).toBe(0);
    const remaining = await listDir(tmpDir);
    expect(remaining).toContain(boundary);
  });

  it('leaves files with unparseable date stamps untouched', async () => {
    await touch(tmpDir, 'context-decisions-not-a-date.jsonl');
    await touch(tmpDir, 'context-decisions.jsonl'); // legacy undated
    await touch(tmpDir, 'context-decisions-2026-99-99.jsonl'); // invalid date

    const removed = await purgeOlderThan(tmpDir, 'context-decisions', 30);

    expect(removed).toBe(0);
    const remaining = await listDir(tmpDir);
    expect(remaining).toHaveLength(3);
  });

  it('handles missing directory gracefully (returns 0)', async () => {
    const missing = path.join(tmpDir, 'nonexistent');
    await expect(purgeOlderThan(missing, 'context-decisions', 30)).resolves.toBe(0);
  });

  it('removes intraday rotation files (.1, .2) older than cutoff', async () => {
    const oldDate = utcDate(35).toISOString().slice(0, 10);
    const rotation1 = `context-decisions-${oldDate}.1.jsonl`;
    const rotation2 = `context-decisions-${oldDate}.2.jsonl`;
    await touch(tmpDir, rotation1);
    await touch(tmpDir, rotation2);

    const removed = await purgeOlderThan(tmpDir, 'context-decisions', 30);

    expect(removed).toBe(2);
    const remaining = await listDir(tmpDir);
    expect(remaining).toHaveLength(0);
  });

  it('does not purge files from a different basename', async () => {
    const old = buildDatedFilename('research-outcomes', utcDate(60));
    await touch(tmpDir, old);

    const removed = await purgeOlderThan(tmpDir, 'context-decisions', 30);

    expect(removed).toBe(0);
    const remaining = await listDir(tmpDir);
    expect(remaining).toContain(old);
  });

  it('returns count of all removed files when multiple are old', async () => {
    for (let i = 31; i <= 40; i++) {
      await touch(tmpDir, buildDatedFilename('context-decisions', utcDate(i)));
    }
    const removed = await purgeOlderThan(tmpDir, 'context-decisions', 30);
    expect(removed).toBe(10);
  });
});

// ─── migrateLegacyJsonl ───────────────────────────────────────────────────────

describe('migrateLegacyJsonl', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('renames the legacy file to a dated name using mtime UTC date', async () => {
    const legacyPath = path.join(tmpDir, 'context-decisions.jsonl');
    await fs.writeFile(legacyPath, 'data', 'utf8');
    // Force mtime to a known UTC date
    const knownDate = new Date('2026-03-01T00:00:00Z');
    await fs.utimes(legacyPath, knownDate, knownDate);

    await migrateLegacyJsonl(tmpDir, 'context-decisions');

    const remaining = await listDir(tmpDir);
    expect(remaining).toContain('context-decisions-2026-03-01.jsonl');
    expect(remaining).not.toContain('context-decisions.jsonl');
  });

  it('is a no-op when the legacy file does not exist', async () => {
    await expect(migrateLegacyJsonl(tmpDir, 'context-decisions')).resolves.toBeUndefined();
    expect(await listDir(tmpDir)).toHaveLength(0);
  });

  it('does not clobber an existing dated file', async () => {
    const legacyPath = path.join(tmpDir, 'context-decisions.jsonl');
    await fs.writeFile(legacyPath, 'legacy-data', 'utf8');
    const knownDate = new Date('2026-03-01T00:00:00Z');
    await fs.utimes(legacyPath, knownDate, knownDate);

    const datedPath = path.join(tmpDir, 'context-decisions-2026-03-01.jsonl');
    await fs.writeFile(datedPath, 'existing-data', 'utf8');

    await migrateLegacyJsonl(tmpDir, 'context-decisions');

    // Existing dated file must be untouched
    const content = await fs.readFile(datedPath, 'utf8');
    expect(content).toBe('existing-data');
    // Legacy file stays (rename was skipped)
    const remaining = await listDir(tmpDir);
    expect(remaining).toContain('context-decisions.jsonl');
  });
});
