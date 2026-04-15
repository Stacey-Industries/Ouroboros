/**
 * ptyTimings.test.ts — Unit tests for PTY session timing helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockOnPtyExit = vi.fn();
vi.mock('./telemetry', () => ({
  getOutcomeObserver: () => ({ onPtyExit: mockOnPtyExit }),
}));

import { recordPtyStart, reportPtyExit } from './ptyTimings';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recordPtyStart + reportPtyExit', () => {
  it('fires onPtyExit with measured duration', () => {
    vi.setSystemTime(1000);
    recordPtyStart('sess-1');

    vi.setSystemTime(3000);
    reportPtyExit('sess-1', '/workspace', 0);

    expect(mockOnPtyExit).toHaveBeenCalledOnce();
    expect(mockOnPtyExit).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1', cwd: '/workspace', exitCode: 0, durationMs: 2000 }),
    );
  });

  it('uses durationMs=0 when no start time was recorded', () => {
    vi.setSystemTime(5000);
    reportPtyExit('unknown-sess', '/tmp', 1);

    expect(mockOnPtyExit).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'unknown-sess', durationMs: 0 }),
    );
  });

  it('cleans up start timestamp after exit so second exit is durationMs=0', () => {
    vi.setSystemTime(0);
    recordPtyStart('sess-2');

    vi.setSystemTime(1000);
    reportPtyExit('sess-2', '/a', 0);
    mockOnPtyExit.mockClear();

    vi.setSystemTime(2000);
    reportPtyExit('sess-2', '/a', 0);
    expect(mockOnPtyExit).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 0 }),
    );
  });
});
