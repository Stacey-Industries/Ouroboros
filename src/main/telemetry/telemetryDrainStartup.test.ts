/**
 * telemetryDrainStartup.test.ts — Wave 52 Phase B
 *
 * Coverage for the startup wrapper:
 *   - flag default (absent → true) runs the drain
 *   - flag set to false skips the drain entirely
 *   - drain throws → no rethrow (startup must not be blocked)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetConfigValue, mockEnforceTotalDirCap, mockDrainQueue, logWarn, logInfo } = vi.hoisted(
  () => ({
    mockGetConfigValue: vi.fn(),
    mockEnforceTotalDirCap: vi.fn(),
    mockDrainQueue: vi.fn(),
    logWarn: vi.fn(),
    logInfo: vi.fn(),
  }),
);

vi.mock('../config', () => ({ getConfigValue: mockGetConfigValue }));
vi.mock('./queueRotation', () => ({ enforceTotalDirCap: mockEnforceTotalDirCap }));
vi.mock('./telemetryDrain', () => ({ drainQueue: mockDrainQueue }));
vi.mock('./telemetryQueue', () => ({ getQueueDir: () => '/fake/queue' }));
vi.mock('../logger', () => ({ default: { info: logInfo, warn: logWarn, error: vi.fn() } }));

import { runParityQueueDrain } from './telemetryDrainStartup';

beforeEach(() => {
  mockGetConfigValue.mockReset();
  mockEnforceTotalDirCap.mockReset();
  mockDrainQueue.mockReset();
  logWarn.mockReset();
  logInfo.mockReset();
  mockEnforceTotalDirCap.mockReturnValue({ dropped: [] });
  mockDrainQueue.mockResolvedValue({
    filesProcessed: 0,
    recordsImported: 0,
    recordsSkipped: 0,
    recordsErrored: 0,
  });
});

afterEach(() => vi.restoreAllMocks());

describe('runParityQueueDrain', () => {
  it('runs the cap + drain when the flag is absent (default true)', async () => {
    mockGetConfigValue.mockReturnValue(undefined);
    await runParityQueueDrain();
    expect(mockEnforceTotalDirCap).toHaveBeenCalledWith('/fake/queue');
    expect(mockDrainQueue).toHaveBeenCalledTimes(1);
  });

  it('runs when telemetry exists but parityQueue.enabled is unset', async () => {
    mockGetConfigValue.mockReturnValue({ structured: true });
    await runParityQueueDrain();
    expect(mockDrainQueue).toHaveBeenCalledTimes(1);
  });

  it('skips drain when parityQueue.enabled is explicitly false', async () => {
    mockGetConfigValue.mockReturnValue({ parityQueue: { enabled: false } });
    await runParityQueueDrain();
    expect(mockEnforceTotalDirCap).not.toHaveBeenCalled();
    expect(mockDrainQueue).not.toHaveBeenCalled();
  });

  it('does not throw when drainQueue rejects', async () => {
    mockGetConfigValue.mockReturnValue({ parityQueue: { enabled: true } });
    mockDrainQueue.mockRejectedValue(new Error('boom'));
    await expect(runParityQueueDrain()).resolves.toBeUndefined();
    expect(logWarn).toHaveBeenCalled();
  });

  it('logs dropped over-cap files', async () => {
    mockGetConfigValue.mockReturnValue({ parityQueue: { enabled: true } });
    mockEnforceTotalDirCap.mockReturnValue({ dropped: ['old.jsonl'] });
    await runParityQueueDrain();
    expect(logWarn).toHaveBeenCalled();
  });

  it('logs drain summary when files were processed', async () => {
    mockGetConfigValue.mockReturnValue(undefined);
    mockDrainQueue.mockResolvedValue({
      filesProcessed: 2,
      recordsImported: 5,
      recordsSkipped: 0,
      recordsErrored: 0,
    });
    await runParityQueueDrain();
    expect(logInfo).toHaveBeenCalled();
  });
});
