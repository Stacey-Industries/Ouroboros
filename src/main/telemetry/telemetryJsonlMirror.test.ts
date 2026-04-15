/**
 * telemetryJsonlMirror.test.ts
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTelemetryJsonlMirror, purgeOldFiles } from './telemetryJsonlMirror';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `telem-mirror-${crypto.randomUUID()}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listJsonlFiles(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
}

function readLines(filePath: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

// ─── File creation ────────────────────────────────────────────────────────────

describe('createTelemetryJsonlMirror', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
     
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the file on first appendEvent', () => {
    const mirror = createTelemetryJsonlMirror(tmpDir);
    mirror.appendEvent({ type: 'test', ts: 1 });
    mirror.close();

    const files = listJsonlFiles(tmpDir);
    expect(files).toHaveLength(1);
  });

  it('filename matches events-YYYY-MM-DD.jsonl pattern', () => {
    const mirror = createTelemetryJsonlMirror(tmpDir);
    mirror.appendEvent({ type: 'test' });
    mirror.close();

    const files = listJsonlFiles(tmpDir);
    expect(files[0]).toMatch(/^events-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  it('each appendEvent writes a valid JSON line', () => {
    const mirror = createTelemetryJsonlMirror(tmpDir);
    const events = [
      { type: 'pre_tool_use', sessionId: 'abc' },
      { type: 'post_tool_use', sessionId: 'abc' },
      { type: 'agent_start', sessionId: 'xyz' },
    ];
    for (const e of events) mirror.appendEvent(e);
    mirror.close();

    const file = path.join(tmpDir, listJsonlFiles(tmpDir)[0]);
    const lines = readLines(file);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('malformed event objects do not corrupt the file', () => {
    const mirror = createTelemetryJsonlMirror(tmpDir);
    mirror.appendEvent({ type: 'good', seq: 1 });

    // Create a circular-reference object that JSON.stringify will throw on
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    mirror.appendEvent(circular); // should be caught, not crash

    mirror.appendEvent({ type: 'good', seq: 2 });
    mirror.close();

    const files = listJsonlFiles(tmpDir);
    // File should still exist with the 2 good lines
    const file = path.join(tmpDir, files[0]);
    const lines = readLines(file);
    // Both good lines present; bad line silently skipped
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ─── Rotation at 10 MB ────────────────────────────────────────────────────────

describe('rotation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rotates when file crosses 10 MB by pre-seeding a large file', () => {
    const mirror = createTelemetryJsonlMirror(tmpDir);

    // Write one event to create + open the file
    mirror.appendEvent({ type: 'seed' });
    mirror.close();

    // Find the current file and bloat it past 10 MB
    const files = listJsonlFiles(tmpDir);
    const currentFile = path.join(tmpDir, files[0]);
    const tenMbPlus = Buffer.alloc(10 * 1024 * 1024 + 1, 'x');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    fs.writeFileSync(currentFile, tenMbPlus);

    // Re-open mirror — next appendEvent should trigger rotation
    const mirror2 = createTelemetryJsonlMirror(tmpDir);
    mirror2.appendEvent({ type: 'after_rotation' });
    mirror2.close();

    // The old file should have been renamed to .bak
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    const bakFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.bak'));
    expect(bakFiles).toHaveLength(1);

    // A fresh .jsonl should exist with just the new event
    const jsonlFiles = listJsonlFiles(tmpDir);
    expect(jsonlFiles).toHaveLength(1);
    const lines = readLines(path.join(tmpDir, jsonlFiles[0]));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ type: 'after_rotation' });
  });
});

// ─── purgeOldFiles ────────────────────────────────────────────────────────────

describe('purgeOldFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
     
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes files older than retentionDays using utimesSync to age them', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Create two old files and one recent file
    const oldFile1 = path.join(tmpDir, 'events-2025-01-01.jsonl');
    const oldFile2 = path.join(tmpDir, 'events-2025-01-02.jsonl');
    const recentFile = path.join(tmpDir, 'events-2099-12-31.jsonl');

    for (const f of [oldFile1, oldFile2, recentFile]) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
      fs.writeFileSync(f, '{"type":"test"}\n');
    }

    // Age the old files to 40 days ago
    const oldMtime = new Date(now - 40 * dayMs);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    fs.utimesSync(oldFile1, oldMtime, oldMtime);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    fs.utimesSync(oldFile2, oldMtime, oldMtime);

    const deleted = purgeOldFiles(tmpDir, 30);

    expect(deleted).toBe(2);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    expect(fs.existsSync(oldFile1)).toBe(false);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    expect(fs.existsSync(oldFile2)).toBe(false);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it('returns 0 when no files are old enough', () => {
    const recentFile = path.join(tmpDir, 'events-2099-01-01.jsonl');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    fs.writeFileSync(recentFile, '{"type":"test"}\n');
    expect(purgeOldFiles(tmpDir, 30)).toBe(0);
  });

  it('returns 0 for an empty directory', () => {
    expect(purgeOldFiles(tmpDir, 30)).toBe(0);
  });
});
