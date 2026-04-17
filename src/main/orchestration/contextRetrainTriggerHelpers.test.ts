/* eslint-disable security/detect-non-literal-fs-filename -- test file; paths from os.tmpdir() */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countRows,
  parseSummaryLine,
  resetPythonCache,
} from './contextRetrainTriggerHelpers';

// ─── Temp dir setup ──────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-retrain-helpers-'));
  resetPythonCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── countRows ───────────────────────────────────────────────────────────────

describe('countRows', () => {
  it('returns 0 when file does not exist', async () => {
    expect(await countRows(path.join(tmpDir, 'missing.jsonl'))).toBe(0);
  });

  it('counts non-empty lines', async () => {
    const p = path.join(tmpDir, 'outcomes.jsonl');
    fs.writeFileSync(p, '{"a":1}\n{"b":2}\n{"c":3}\n', 'utf8');
    expect(await countRows(p)).toBe(3);
  });

  it('ignores blank lines', async () => {
    const p = path.join(tmpDir, 'outcomes.jsonl');
    fs.writeFileSync(p, '{"a":1}\n\n{"b":2}\n\n', 'utf8');
    expect(await countRows(p)).toBe(2);
  });
});

// ─── parseSummaryLine ────────────────────────────────────────────────────────

describe('parseSummaryLine', () => {
  it('parses a well-formed summary line', () => {
    const result = parseSummaryLine('trained samples=250 auc=0.8421 version=2026-04-17T00:00:00Z');
    expect(result).not.toBeNull();
    expect(result!.samples).toBe(250);
    expect(result!.auc).toBe('0.8421');
    expect(result!.version).toBe('2026-04-17T00:00:00Z');
    expect(result!.belowMinSamples).toBe(false);
  });

  it('detects belowMinSamples=true flag', () => {
    const line = 'trained samples=10 auc=0.55 version=2026-04-17T00:00:00Z belowMinSamples=true';
    const result = parseSummaryLine(line);
    expect(result!.belowMinSamples).toBe(true);
    expect(result!.samples).toBe(10);
  });

  it('returns null when summary line is absent', () => {
    expect(parseSummaryLine('some other output')).toBeNull();
  });
});

// ─── findPython ──────────────────────────────────────────────────────────────

describe('findPython', () => {
  describe('when a python binary is available', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('node:child_process', () => ({
        execFile: (_b: string, _a: string[], _o: object, cb: (e: Error | null) => void) => cb(null),
        spawn: vi.fn(),
      }));
    });

    afterEach(() => {
      vi.doUnmock('node:child_process');
      vi.resetModules();
    });

    it('returns a non-empty string', async () => {
      const { findPython: fp } = await import('./contextRetrainTriggerHelpers');
      const result = await fp();
      expect(typeof result).toBe('string');
      expect(result).toBeTruthy();
    });
  });

  describe('when no python binary is available', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('node:child_process', () => ({
        execFile: (
          _b: string, _a: string[], _o: object,
          cb: (e: Error | null) => void,
        ) => cb(new Error('not found')),
        spawn: vi.fn(),
      }));
    });

    afterEach(() => {
      vi.doUnmock('node:child_process');
      vi.resetModules();
    });

    it('returns null', async () => {
      const { findPython: fp } = await import('./contextRetrainTriggerHelpers');
      expect(await fp()).toBeNull();
    });
  });
});

// ─── spawnTrainer ────────────────────────────────────────────────────────────

describe('spawnTrainer', () => {
  it('resolves success=true when process exits 0', async () => {
    const { EventEmitter } = await import('node:events');

    const stdout = new EventEmitter() as NodeJS.ReadableStream;
    const stderr = new EventEmitter() as NodeJS.ReadableStream;
    const proc = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: typeof stdout;
      stderr: typeof stderr;
    };
    proc.stdout = stdout;
    proc.stderr = stderr;

    vi.doMock('node:child_process', () => ({ spawn: vi.fn(() => proc), execFile: vi.fn() }));
    vi.resetModules();

    const { spawnTrainer: st } = await import('./contextRetrainTriggerHelpers');
    const promise = st({
      pythonBin: 'python3',
      scriptPath: '/tools/train-context.py',
      decisionsPath: '/data/decisions.jsonl',
      outcomesPath: '/data/outcomes.jsonl',
      weightsOutPath: '/data/weights.json',
    });

    // Emit stdout summary then close
    stdout.emit('data', Buffer.from('trained samples=200 auc=0.81 version=2026-04-17T00:00:00Z\n'));
    proc.emit('close', 0);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('trained samples=200');

    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('resolves success=false when process exits non-zero', async () => {
    const { EventEmitter } = await import('node:events');

    const stdout = new EventEmitter() as NodeJS.ReadableStream;
    const stderr = new EventEmitter() as NodeJS.ReadableStream;
    const proc = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: typeof stdout;
      stderr: typeof stderr;
    };
    proc.stdout = stdout;
    proc.stderr = stderr;

    vi.doMock('node:child_process', () => ({ spawn: vi.fn(() => proc), execFile: vi.fn() }));
    vi.resetModules();

    const { spawnTrainer: st } = await import('./contextRetrainTriggerHelpers');
    const promise = st({
      pythonBin: 'python3',
      scriptPath: '/tools/train-context.py',
      decisionsPath: '/data/decisions.jsonl',
      outcomesPath: '/data/outcomes.jsonl',
      weightsOutPath: '/data/weights.json',
    });

    stderr.emit('data', Buffer.from('ERROR: something went wrong'));
    proc.emit('close', 1);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ERROR');

    vi.doUnmock('node:child_process');
    vi.resetModules();
  });
});
