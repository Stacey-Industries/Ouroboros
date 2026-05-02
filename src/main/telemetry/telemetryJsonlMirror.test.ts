/**
 * telemetryJsonlMirror.test.ts — Wave 70 Phase C2/C4 smoke coverage.
 *
 * Verifies:
 *  - appendEvent writes a JSONL line per event to events-YYYY-MM-DD.jsonl
 *  - close releases the file descriptor
 *  - compressOldFiles gzips files older than 1 day, leaving today's untouched
 *  - purgeOldFiles drops files past the retention cutoff (and respects the
 *    10-year default by NOT purging recent files)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  compressOldFiles,
  createTelemetryJsonlMirror,
  purgeOldFiles,
} from './telemetryJsonlMirror';

let dir: string;

function todayName(): string {
  return `events-${new Date().toISOString().slice(0, 10)}.jsonl`;
}

function readLines(filePath: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path under os.tmpdir()
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-mirror-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('createTelemetryJsonlMirror — append + close', () => {
  it('writes one JSON line per event to today\'s file', () => {
    const mirror = createTelemetryJsonlMirror(dir, { enableGzipTask: false });
    mirror.appendEvent({ type: 'a', id: 1 });
    mirror.appendEvent({ type: 'b', id: 2 });
    mirror.close();

    const expected = path.join(dir, todayName());
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(expected)).toBe(true);
    const lines = readLines(expected);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ type: 'a', id: 1 });
    expect(JSON.parse(lines[1])).toEqual({ type: 'b', id: 2 });
  });

  it('survives close+reopen by appending to the same daily file', () => {
    const m1 = createTelemetryJsonlMirror(dir, { enableGzipTask: false });
    m1.appendEvent({ id: 1 });
    m1.close();
    const m2 = createTelemetryJsonlMirror(dir, { enableGzipTask: false });
    m2.appendEvent({ id: 2 });
    m2.close();
    const lines = readLines(path.join(dir, todayName()));
    expect(lines).toHaveLength(2);
  });
});

describe('purgeOldFiles', () => {
  it('removes files older than retention cutoff', () => {
    const old = path.join(dir, 'events-2020-01-01.jsonl');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    fs.writeFileSync(old, '{"x":1}\n');
    const oldTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    fs.utimesSync(old, oldTime / 1000, oldTime / 1000);

    const deleted = purgeOldFiles(dir, 30);
    expect(deleted).toBe(1);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(old)).toBe(false);
  });

  it('keeps recent files under the 10-year defensive default', () => {
    const m = createTelemetryJsonlMirror(dir, { enableGzipTask: false });
    m.appendEvent({ id: 1 });
    m.close();

    const deleted = m.purgeOldFiles();
    expect(deleted).toBe(0);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(path.join(dir, todayName()))).toBe(true);
  });
});

describe('compressOldFiles', () => {
  it('gzips files older than 1 day and removes the source', async () => {
    const yesterday = path.join(dir, 'events-2024-01-15.jsonl');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    fs.writeFileSync(yesterday, '{"id":1}\n{"id":2}\n');
    const t = Date.now() - 2 * 24 * 60 * 60 * 1000;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    fs.utimesSync(yesterday, t / 1000, t / 1000);

    compressOldFiles(dir);
    // pipeline is async — wait briefly for compress to land
    await new Promise((r) => setTimeout(r, 200));

    const gzPath = `${yesterday}.gz`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(gzPath)).toBe(true);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(yesterday)).toBe(false);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    const decoded = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8');
    expect(decoded).toContain('"id":1');
    expect(decoded).toContain('"id":2');
  });

  it('leaves today\'s file untouched', () => {
    const m = createTelemetryJsonlMirror(dir, { enableGzipTask: false });
    m.appendEvent({ id: 1 });
    m.close();

    compressOldFiles(dir);

    const todayPath = path.join(dir, todayName());
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(todayPath)).toBe(true);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test path
    expect(fs.existsSync(`${todayPath}.gz`)).toBe(false);
  });
});
