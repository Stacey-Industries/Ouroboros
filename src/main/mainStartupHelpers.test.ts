/**
 * mainStartupHelpers.test.ts — Smoke tests for bootstrap helpers extracted
 * from mainStartup.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockCrashReporterStart,
  mockAppSetName,
  mockAppCommandLineAppendSwitch,
  mockCloseEP,
  mockMigrateLegacyJsonl,
  mockPurgeOlderThan,
} = vi.hoisted(() => ({
  mockCrashReporterStart: vi.fn(),
  mockAppSetName: vi.fn(),
  mockAppCommandLineAppendSwitch: vi.fn(),
  mockCloseEP: vi.fn(),
  mockMigrateLegacyJsonl: vi.fn().mockResolvedValue(undefined),
  mockPurgeOlderThan: vi.fn().mockResolvedValue(0),
}));

vi.mock('electron', () => ({
  app: {
    setName: mockAppSetName,
    commandLine: { appendSwitch: mockAppCommandLineAppendSwitch },
    isPackaged: false,
  },
  crashReporter: {
    start: mockCrashReporterStart,
  },
}));

vi.mock('./orchestration/editProvenance', () => ({
  closeEditProvenance: mockCloseEP,
  initEditProvenance: vi.fn(),
}));

vi.mock('./orchestration/jsonlRetention', () => ({
  migrateLegacyJsonl: mockMigrateLegacyJsonl,
  purgeOlderThan: mockPurgeOlderThan,
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  bootstrapApp,
  bootstrapCrashReporter,
  closeEditProvenance,
  scheduleJsonlRetentionPurge,
} from './mainStartupHelpers';

// ─── bootstrapCrashReporter ───────────────────────────────────────────────────

describe('bootstrapCrashReporter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts the crash reporter with uploadToServer false', () => {
    bootstrapCrashReporter();
    expect(mockCrashReporterStart).toHaveBeenCalledOnce();
    expect(mockCrashReporterStart).toHaveBeenCalledWith(
      expect.objectContaining({ uploadToServer: false }),
    );
  });

  it('enables compression', () => {
    bootstrapCrashReporter();
    expect(mockCrashReporterStart).toHaveBeenCalledWith(
      expect.objectContaining({ compress: true }),
    );
  });
});

// ─── bootstrapApp ─────────────────────────────────────────────────────────────

describe('bootstrapApp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets the app name to Ouroboros', () => {
    bootstrapApp();
    expect(mockAppSetName).toHaveBeenCalledWith('Ouroboros');
  });

  it('appends disable-gpu-sandbox command-line switch', () => {
    bootstrapApp();
    expect(mockAppCommandLineAppendSwitch).toHaveBeenCalledWith('disable-gpu-sandbox');
  });

  it('appends no-sandbox switch when app is not packaged', () => {
    bootstrapApp();
    expect(mockAppCommandLineAppendSwitch).toHaveBeenCalledWith('no-sandbox');
  });
});

// ─── closeEditProvenance ──────────────────────────────────────────────────────

describe('closeEditProvenance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to the editProvenance closeEditProvenance function', () => {
    closeEditProvenance();
    expect(mockCloseEP).toHaveBeenCalledOnce();
  });
});

// ─── scheduleJsonlRetentionPurge ──────────────────────────────────────────────

describe('scheduleJsonlRetentionPurge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs migrate and purge for all four basenames', async () => {
    scheduleJsonlRetentionPurge('/tmp/userData');
    await vi.runAllTimersAsync();

    const expectedBases = [
      'context-decisions',
      'context-outcomes',
      'research-outcomes',
      'corrections',
    ];
    for (const base of expectedBases) {
      expect(mockMigrateLegacyJsonl).toHaveBeenCalledWith('/tmp/userData', base);
      expect(mockPurgeOlderThan).toHaveBeenCalledWith('/tmp/userData', base, 30);
    }
  });

  it('passes the provided userDataPath to each migrate call', async () => {
    scheduleJsonlRetentionPurge('/custom/path');
    await vi.runAllTimersAsync();
    expect(mockMigrateLegacyJsonl).toHaveBeenCalledWith('/custom/path', expect.any(String));
  });
});
