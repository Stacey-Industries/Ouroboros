/**
 * contextRetrainStartup.test.ts — Wave 70 Phase A2.
 *
 * Smoke coverage for the wire-up: trigger is started when
 * `contextRanker.autoRetrainEnabled` is true and the trainer script exists,
 * skipped otherwise. Stop is idempotent. Status reflects wired/unwired state.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { startMock, getConfigValueMock, getAppPathMock } = vi.hoisted(() => ({
  startMock: vi.fn(() => ({
    stop: vi.fn(),
    getStatus: vi.fn(() => ({
      enabled: true,
      lastRunAt: null,
      lastOutcome: null,
      lastError: null,
      rowCountAtLastRun: 0,
      nextTriggerRowCount: 200,
    })),
    requestNow: vi.fn(),
  })),
  getConfigValueMock: vi.fn(),
  getAppPathMock: vi.fn(),
}));

vi.mock('./contextRetrainTrigger', () => ({
  startContextRetrainTrigger: startMock,
}));

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => getConfigValueMock(...args),
}));

vi.mock('electron', () => ({
  app: { getAppPath: () => getAppPathMock() },
}));

import {
  getContextRetrainStatus,
  startContextRetrainTriggerIfEnabled,
  stopContextRetrainTrigger,
} from './contextRetrainStartup';

let userDataDir: string;
let appPath: string;

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-retrain-startup-'));
  appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-retrain-app-'));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path is constructed from a known temp root
  fs.mkdirSync(path.join(appPath, 'tools'), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path is constructed from a known temp root
  fs.writeFileSync(path.join(appPath, 'tools', 'train-context.py'), '# stub');
  getAppPathMock.mockReturnValue(appPath);
  startMock.mockClear();
  getConfigValueMock.mockReset();
});

afterEach(() => {
  stopContextRetrainTrigger();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(appPath, { recursive: true, force: true });
});

describe('startContextRetrainTriggerIfEnabled', () => {
  it('wires the trigger when autoRetrainEnabled is true and script resolves', () => {
    getConfigValueMock.mockImplementation((key: string) =>
      key === 'contextRanker' ? { autoRetrainEnabled: true } : undefined,
    );

    startContextRetrainTriggerIfEnabled(userDataDir);

    expect(startMock).toHaveBeenCalledTimes(1);
    const cfg = startMock.mock.calls[0][0];
    expect(cfg.outcomesPath).toBe(userDataDir);
    expect(cfg.decisionsPath).toBe(userDataDir);
    expect(cfg.weightsOutPath).toBe(path.join(userDataDir, 'context-retrained-weights.json'));
    expect(cfg.scriptPath).toBe(path.join(appPath, 'tools', 'train-context.py'));
    expect(getContextRetrainStatus().wired).toBe(true);
  });

  it('defaults autoRetrainEnabled to true when the field is absent', () => {
    getConfigValueMock.mockReturnValue({});

    startContextRetrainTriggerIfEnabled(userDataDir);

    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('skips when autoRetrainEnabled is false', () => {
    getConfigValueMock.mockImplementation((key: string) =>
      key === 'contextRanker' ? { autoRetrainEnabled: false } : undefined,
    );

    startContextRetrainTriggerIfEnabled(userDataDir);

    expect(startMock).not.toHaveBeenCalled();
    expect(getContextRetrainStatus().wired).toBe(false);
  });

  it('skips when the trainer script cannot be resolved', () => {
    getConfigValueMock.mockReturnValue({ autoRetrainEnabled: true });
    fs.rmSync(path.join(appPath, 'tools'), { recursive: true, force: true });
    // process.resourcesPath is also unlikely to host the script in the test env

    startContextRetrainTriggerIfEnabled(userDataDir);

    expect(startMock).not.toHaveBeenCalled();
    expect(getContextRetrainStatus().wired).toBe(false);
  });

  it('is idempotent — calling twice still yields a single trigger', () => {
    getConfigValueMock.mockReturnValue({ autoRetrainEnabled: true });

    startContextRetrainTriggerIfEnabled(userDataDir);
    startContextRetrainTriggerIfEnabled(userDataDir);

    expect(startMock).toHaveBeenCalledTimes(1);
  });
});

describe('stopContextRetrainTrigger', () => {
  it('is a no-op before start', () => {
    expect(() => stopContextRetrainTrigger()).not.toThrow();
    expect(getContextRetrainStatus().wired).toBe(false);
  });

  it('clears the wired state after start', () => {
    getConfigValueMock.mockReturnValue({ autoRetrainEnabled: true });

    startContextRetrainTriggerIfEnabled(userDataDir);
    expect(getContextRetrainStatus().wired).toBe(true);

    stopContextRetrainTrigger();
    expect(getContextRetrainStatus().wired).toBe(false);
  });
});
