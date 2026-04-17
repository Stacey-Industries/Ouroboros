/* eslint-disable security/detect-non-literal-fs-filename -- test file; paths from os.tmpdir() */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./contextClassifier', () => ({
  reloadContextWeights: vi.fn().mockResolvedValue({ loaded: true, version: 'v-test' }),
}));

vi.mock('./contextRetrainTriggerHelpers', async (importOriginal) => {
  const real = await importOriginal<typeof import('./contextRetrainTriggerHelpers')>();
  return {
    ...real,
    spawnTrainer: vi.fn(),
    findPython: vi.fn().mockResolvedValue('python3'),
    // countRows is mocked so tests aren't blocked on libuv I/O callbacks
    countRows: vi.fn().mockResolvedValue(0),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { reloadContextWeights } from './contextClassifier';
import { startContextRetrainTrigger } from './contextRetrainTrigger';
import { countRows, findPython, spawnTrainer } from './contextRetrainTriggerHelpers';

const spawnMock = vi.mocked(spawnTrainer);
const reloadMock = vi.mocked(reloadContextWeights);
const findPythonMock = vi.mocked(findPython);
const countRowsMock = vi.mocked(countRows);

// ─── Result factories ─────────────────────────────────────────────────────────

type SpawnReturn = Awaited<ReturnType<typeof spawnTrainer>>;

function successResult(samples = 200, auc = '0.82'): Promise<SpawnReturn> {
  return Promise.resolve({
    success: true, exitCode: 0,
    stdout: `trained samples=${samples} auc=${auc} version=2026-04-17T00:00:00.000Z`,
    stderr: '',
  });
}

function belowMinResult(): Promise<SpawnReturn> {
  return Promise.resolve({
    success: true, exitCode: 0,
    stdout: 'trained samples=10 auc=0.55 version=2026-04-17T00:00:00.000Z belowMinSamples=true',
    stderr: '',
  });
}

function failResult(): Promise<SpawnReturn> {
  return Promise.resolve({ success: false, exitCode: 1, stdout: '', stderr: 'ERROR: bad' });
}

// ─── Temp dir + per-test paths ────────────────────────────────────────────────

let tmpDir: string;
let outcomesPath: string;
let decisionsPath: string;
let weightsOutPath: string;
let scriptPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-retrain-trigger-'));
  outcomesPath = path.join(tmpDir, 'context-outcomes.jsonl');
  decisionsPath = path.join(tmpDir, 'context-decisions.jsonl');
  weightsOutPath = path.join(tmpDir, 'context-retrained-weights.json');
  scriptPath = path.join(tmpDir, 'train-context.py');
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => successResult());
  reloadMock.mockReset();
  reloadMock.mockResolvedValue({ loaded: true, version: 'v-test' });
  findPythonMock.mockResolvedValue('python3');
  // countRows mocked — avoid libuv I/O making async chains outlive each test.
  // Default: 0 rows. Tests override via countRowsMock.mockResolvedValue(n).
  countRowsMock.mockReset();
  countRowsMock.mockResolvedValue(0);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drain all pending Promise microtasks.
 * Since countRows is mocked (no libuv I/O), a single Promise.resolve() flush
 * suffices — but we repeat a few times to handle chained awaits in executeRetrain.
 */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

function makeConfig(overrides: Partial<Parameters<typeof startContextRetrainTrigger>[0]> = {}) {
  return {
    outcomesPath, decisionsPath, weightsOutPath, scriptPath,
    minNewRowsToTrigger: 200,
    cooldownMs: 60_000,
    pythonBin: 'python3',
    ...overrides,
  };
}

/**
 * Start a controller with countRows mocked to return 0 initially (baseline=0),
 * drain the async init, then set countRows to return n for subsequent calls.
 */
async function startWithRows(n: number, overrides = {}) {
  countRowsMock.mockResolvedValue(0); // baseline = 0
  const ctrl = startContextRetrainTrigger(makeConfig(overrides));
  await flushAsync(); // drain the void countRows baseline init
  countRowsMock.mockResolvedValue(n); // subsequent calls see n rows
  return ctrl;
}

/** Trigger requestNow() and drain all resulting async work. */
async function triggerAndFlush(ctrl: ReturnType<typeof startContextRetrainTrigger>) {
  ctrl.requestNow();
  await flushAsync();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('startContextRetrainTrigger', () => {
  describe('initial state', () => {
    it('returns enabled=true with rowCountAtLastRun=0 when file is missing', async () => {
      const ctrl = startContextRetrainTrigger(makeConfig());
      await flushAsync();
      const s = ctrl.getStatus();
      expect(s.enabled).toBe(true);
      expect(s.rowCountAtLastRun).toBe(0);
      expect(s.lastOutcome).toBeNull();
      ctrl.stop();
    });

    it('does not fire retrain when outcomes file has 0 rows', async () => {
      const ctrl = await startWithRows(0);
      await triggerAndFlush(ctrl);
      expect(spawnMock).not.toHaveBeenCalled();
      ctrl.stop();
    });
  });

  describe('row-count gate', () => {
    it('fires retrain when new rows >= minNewRowsToTrigger', async () => {
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      expect(spawnMock).toHaveBeenCalledOnce();
      ctrl.stop();
    });

    it('does not retrain when new rows are below threshold', async () => {
      const ctrl = await startWithRows(50, { minNewRowsToTrigger: 200 });
      await triggerAndFlush(ctrl);
      expect(spawnMock).not.toHaveBeenCalled();
      ctrl.stop();
    });
  });

  describe('success path', () => {
    it('calls reloadContextWeights with weightsOutPath on exit 0', async () => {
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      expect(reloadMock).toHaveBeenCalledWith(weightsOutPath);
      expect(ctrl.getStatus().lastOutcome).toBe('success');
      expect(ctrl.getStatus().lastError).toBeNull();
      ctrl.stop();
    });

    it('updates rowCountAtLastRun after success', async () => {
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      expect(ctrl.getStatus().rowCountAtLastRun).toBe(200);
      ctrl.stop();
    });
  });

  describe('failure path', () => {
    it('does not call reload when python exits non-zero', async () => {
      spawnMock.mockImplementation(() => failResult());
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      expect(reloadMock).not.toHaveBeenCalled();
      expect(ctrl.getStatus().lastOutcome).toBe('failure');
      expect(ctrl.getStatus().lastError).toContain('ERROR');
      ctrl.stop();
    });

    it('does not advance rowCountAtLastRun after failure', async () => {
      spawnMock.mockImplementation(() => failResult());
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      expect(ctrl.getStatus().rowCountAtLastRun).toBe(0);
      ctrl.stop();
    });
  });

  describe('debounce (isRunning guard)', () => {
    it('fires only one retrain for multiple rapid requestNow calls', async () => {
      const ctrl = await startWithRows(200);
      // Fire three times rapidly — isRunning guard prevents concurrent retrains
      ctrl.requestNow();
      ctrl.requestNow();
      ctrl.requestNow();
      await flushAsync();
      expect(spawnMock).toHaveBeenCalledOnce();
      ctrl.stop();
    });
  });

  describe('cooldown', () => {
    it('skips a retrain within cooldown window', async () => {
      const ctrl = await startWithRows(200, { cooldownMs: 60_000 });
      await triggerAndFlush(ctrl); // first retrain succeeds
      expect(spawnMock).toHaveBeenCalledTimes(1);

      countRowsMock.mockResolvedValue(400); // ensure row gate passes
      await triggerAndFlush(ctrl); // second within 60s cooldown → skipped
      expect(spawnMock).toHaveBeenCalledTimes(1);
      ctrl.stop();
    });

    it('allows retrain after cooldown expires', async () => {
      // cooldownMs=0 means no cooldown — every call with sufficient rows fires
      const ctrl = await startWithRows(200, { cooldownMs: 0 });
      await triggerAndFlush(ctrl);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      countRowsMock.mockResolvedValue(500);
      await triggerAndFlush(ctrl);
      expect(spawnMock).toHaveBeenCalledTimes(2);
      ctrl.stop();
    });
  });

  describe('requestNow()', () => {
    it('within cooldown: does not spawn', async () => {
      const ctrl = await startWithRows(200, { cooldownMs: 60_000 });
      await triggerAndFlush(ctrl);
      countRowsMock.mockResolvedValue(400);
      await triggerAndFlush(ctrl); // within 60s cooldown
      expect(spawnMock).toHaveBeenCalledTimes(1);
      ctrl.stop();
    });

    it('outside cooldown (cooldownMs=0): fires immediately', async () => {
      const ctrl = await startWithRows(200, { cooldownMs: 0 });
      await triggerAndFlush(ctrl);
      expect(spawnMock).toHaveBeenCalledOnce();
      ctrl.stop();
    });
  });

  describe('stop()', () => {
    it('prevents subsequent retrains after stop', async () => {
      const ctrl = startContextRetrainTrigger(makeConfig());
      await flushAsync();
      ctrl.stop();
      countRowsMock.mockResolvedValue(200);
      ctrl.requestNow(); // no-op after stop
      await flushAsync();
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('is idempotent', () => {
      const ctrl = startContextRetrainTrigger(makeConfig());
      expect(() => { ctrl.stop(); ctrl.stop(); ctrl.stop(); }).not.toThrow();
    });

    it('getStatus returns enabled=false after stop', () => {
      const ctrl = startContextRetrainTrigger(makeConfig());
      ctrl.stop();
      expect(ctrl.getStatus().enabled).toBe(false);
    });
  });

  describe('below-min-samples', () => {
    it('calls reloadContextWeights even when belowMinSamples=true', async () => {
      spawnMock.mockImplementation(() => belowMinResult());
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      expect(reloadMock).toHaveBeenCalledWith(weightsOutPath);
      expect(ctrl.getStatus().lastOutcome).toBe('success');
      ctrl.stop();
    });
  });

  describe('getStatus()', () => {
    it('nextTriggerRowCount = rowCountAtLastRun + minNewRowsToTrigger', () => {
      const ctrl = startContextRetrainTrigger(makeConfig({ minNewRowsToTrigger: 200 }));
      const s = ctrl.getStatus();
      expect(s.nextTriggerRowCount).toBe(s.rowCountAtLastRun + 200);
      ctrl.stop();
    });

    it('lastRunAt is a valid ISO-8601 string after a successful retrain', async () => {
      const ctrl = await startWithRows(200);
      await triggerAndFlush(ctrl);
      const { lastRunAt } = ctrl.getStatus();
      expect(lastRunAt).not.toBeNull();
      // new Date(isoString).toISOString() round-trips correctly
      expect(() => new Date(lastRunAt!).toISOString()).not.toThrow();
      ctrl.stop();
    });
  });
});
