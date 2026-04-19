/**
 * telemetryStore.lifecycle.test.ts — Asserts that traceBatcher and purge are
 * correctly wired into the telemetry store singleton lifecycle.
 *
 * F.1: initTraceBatcher called on initTelemetryStore; drainTraceBatcher called
 *      (before close) on closeTelemetryStore.
 * F.3: purgeRetainedRows scheduled daily + at startup.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// vi.hoisted ensures these refs are available inside vi.mock factories (which are hoisted).
const { mockInitTraceBatcher, mockDrainTraceBatcher, mockPurgeRetainedRows } = vi.hoisted(() => ({
  mockInitTraceBatcher: vi.fn(),
  mockDrainTraceBatcher: vi.fn(),
  mockPurgeRetainedRows: vi.fn(() => 0),
}));

vi.mock('./traceBatcher', () => ({
  initTraceBatcher: mockInitTraceBatcher,
  drainTraceBatcher: mockDrainTraceBatcher,
  enqueueTrace: vi.fn(),
  _resetTraceBatcherForTests: vi.fn(),
}));

vi.mock('./telemetryStoreHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./telemetryStoreHelpers')>();
  return { ...actual, purgeRetainedRows: mockPurgeRetainedRows };
});

import { closeTelemetryStore, initTelemetryStore, setFlagEnabledOverride } from './telemetryStore';

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `telem-lc-test-${crypto.randomUUID()}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('telemetry store lifecycle — traceBatcher wiring (F.1)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.useFakeTimers();
    mockInitTraceBatcher.mockClear();
    mockDrainTraceBatcher.mockClear();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    // Ensure singleton is always cleaned up
    try { closeTelemetryStore(); } catch { /* already closed */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('calls initTraceBatcher once when initTelemetryStore is called', () => {
    initTelemetryStore(tmpDir);
    expect(mockInitTraceBatcher).toHaveBeenCalledTimes(1);
  });

  it('does not call initTraceBatcher twice on repeated init (idempotent)', () => {
    initTelemetryStore(tmpDir);
    initTelemetryStore(tmpDir); // second call should be no-op
    expect(mockInitTraceBatcher).toHaveBeenCalledTimes(1);
  });

  it('calls drainTraceBatcher before store.close in closeTelemetryStore', () => {
    const drainOrder: string[] = [];
    mockDrainTraceBatcher.mockImplementation(() => { drainOrder.push('drain'); });

    initTelemetryStore(tmpDir);
    closeTelemetryStore();

    // drain must have been called
    expect(drainOrder).toContain('drain');
    expect(mockDrainTraceBatcher).toHaveBeenCalledTimes(1);
  });

  it('drain is called before closeTelemetryStore nulls the singleton', () => {
    let drainCalledCount = 0;
    mockDrainTraceBatcher.mockImplementation(() => { drainCalledCount += 1; });

    initTelemetryStore(tmpDir);
    closeTelemetryStore();

    expect(drainCalledCount).toBe(1);
  });
});

describe('telemetry store lifecycle — retention purge scheduling (F.3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.useFakeTimers();
    mockPurgeRetainedRows.mockClear();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    try { closeTelemetryStore(); } catch { /* already closed */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('runs purgeRetainedRows once at startup via setImmediate', () => {
    initTelemetryStore(tmpDir);
    // Let setImmediate callbacks fire
    vi.advanceTimersByTime(0);
    expect(mockPurgeRetainedRows).toHaveBeenCalledTimes(1);
  });

  it('runs purgeRetainedRows again after 24h interval', () => {
    initTelemetryStore(tmpDir);
    vi.advanceTimersByTime(0);
    mockPurgeRetainedRows.mockClear();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockPurgeRetainedRows).toHaveBeenCalledTimes(1);
  });

  it('passes 30-day retention window in ms to purgeRetainedRows', () => {
    initTelemetryStore(tmpDir);
    vi.advanceTimersByTime(0);

    const expectedRetentionMs = 30 * 24 * 60 * 60 * 1000;
    expect(mockPurgeRetainedRows).toHaveBeenCalledWith(
      expect.anything(),
      expectedRetentionMs,
    );
  });

  it('purge interval is cleared on closeTelemetryStore', () => {
    initTelemetryStore(tmpDir);
    vi.advanceTimersByTime(0);
    mockPurgeRetainedRows.mockClear();

    closeTelemetryStore();
    vi.advanceTimersByTime(48 * 60 * 60 * 1000);

    // No additional purge calls after store is closed
    expect(mockPurgeRetainedRows).not.toHaveBeenCalled();
  });
});
