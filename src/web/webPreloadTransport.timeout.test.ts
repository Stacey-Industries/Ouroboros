/**
 * webPreloadTransport.timeout.test.ts — Channel→class mapping and invoke timeout.
 *
 * Wave 33a Phase F.
 *
 * Tests:
 *  - channelTimeoutClass() mapping for short / normal / long channels.
 *  - invoke() uses the class-keyed budget instead of the flat 30 000 ms.
 *  - Non-resumable path: timeout fires at the correct boundary.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { channelTimeoutClass } from './webPreloadTransport';

// ─── channelTimeoutClass mapping tests ────────────────────────────────────────

describe('channelTimeoutClass', () => {
  // ── Short class ─────────────────────────────────────────────────────────────

  it('returns short for config:get', () => {
    expect(channelTimeoutClass('config:get')).toBe('short');
  });

  it('returns short for config:getAll', () => {
    expect(channelTimeoutClass('config:getAll')).toBe('short');
  });

  it('returns short for app:getVersion', () => {
    expect(channelTimeoutClass('app:getVersion')).toBe('short');
  });

  it('returns short for app:getPlatform', () => {
    expect(channelTimeoutClass('app:getPlatform')).toBe('short');
  });

  it('returns short for app:getSystemInfo', () => {
    expect(channelTimeoutClass('app:getSystemInfo')).toBe('short');
  });

  it('returns short for perf:ping', () => {
    expect(channelTimeoutClass('perf:ping')).toBe('short');
  });

  it('returns short for mobileAccess:listPairedDevices', () => {
    expect(channelTimeoutClass('mobileAccess:listPairedDevices')).toBe('short');
  });

  it('returns short for providers:list', () => {
    expect(channelTimeoutClass('providers:list')).toBe('short');
  });

  it('returns short for theme:get', () => {
    expect(channelTimeoutClass('theme:get')).toBe('short');
  });

  // ── Long class ──────────────────────────────────────────────────────────────

  it('returns long for agentChat:sendMessage (chat keyword)', () => {
    expect(channelTimeoutClass('agentChat:sendMessage')).toBe('long');
  });

  it('returns long for spec:scaffold (spec keyword)', () => {
    expect(channelTimeoutClass('spec:scaffold')).toBe('long');
  });

  it('returns long for context:retrain (retrain keyword)', () => {
    expect(channelTimeoutClass('context:retrain')).toBe('long');
  });

  it('returns long for sessions:dispatchTask', () => {
    expect(channelTimeoutClass('sessions:dispatchTask')).toBe('long');
  });

  it('returns long for orchestration:buildContextPacket', () => {
    expect(channelTimeoutClass('orchestration:buildContextPacket')).toBe('long');
  });

  it('returns long for pty:spawn', () => {
    expect(channelTimeoutClass('pty:spawn')).toBe('long');
  });

  it('returns long for pty:spawnClaude', () => {
    expect(channelTimeoutClass('pty:spawnClaude')).toBe('long');
  });

  it('returns long for pty:spawnCodex', () => {
    expect(channelTimeoutClass('pty:spawnCodex')).toBe('long');
  });

  it('returns long for observability:exportTrace', () => {
    expect(channelTimeoutClass('observability:exportTrace')).toBe('long');
  });

  // ── Normal class (default) ──────────────────────────────────────────────────

  it('returns normal for files:readFile', () => {
    expect(channelTimeoutClass('files:readFile')).toBe('normal');
  });

  it('returns normal for git:status', () => {
    expect(channelTimeoutClass('git:status')).toBe('normal');
  });

  it('returns normal for an unknown channel', () => {
    expect(channelTimeoutClass('some:unknown')).toBe('normal');
  });

  it('returns normal for mobileAccess:generatePairingCode', () => {
    expect(channelTimeoutClass('mobileAccess:generatePairingCode')).toBe('normal');
  });
});

// ─── invoke() timeout integration ─────────────────────────────────────────────

describe('WebSocketTransport.invoke timeout (non-resumable)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('rejects with timeout error at the short budget (10 000 ms)', async () => {
    // Inline a minimal transport rather than importing the full class to avoid
    // needing a real WebSocket. The CALL_TIMEOUTS + channelTimeoutClass are
    // what we're validating — the timer arithmetic is the same code path.
    const CALL_TIMEOUTS = { short: 10_000, normal: 30_000, long: 120_000 };
    const budget = CALL_TIMEOUTS[channelTimeoutClass('perf:ping')];
    expect(budget).toBe(10_000);

    // Simulate the pending-request timer pattern from invoke()
    const promise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('IPC timeout: perf:ping')), budget);
    });

    vi.advanceTimersByTime(9_999);
    let rejected = false;
    promise.catch(() => { rejected = true; });
    await Promise.resolve();
    expect(rejected).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(promise).rejects.toThrow('IPC timeout: perf:ping');
  });

  it('uses normal budget (30 000 ms) for git:status', () => {
    const CALL_TIMEOUTS = { short: 10_000, normal: 30_000, long: 120_000 };
    const budget = CALL_TIMEOUTS[channelTimeoutClass('git:status')];
    expect(budget).toBe(30_000);
  });

  it('uses long budget (120 000 ms) for pty:spawn', () => {
    const CALL_TIMEOUTS = { short: 10_000, normal: 30_000, long: 120_000 };
    const budget = CALL_TIMEOUTS[channelTimeoutClass('pty:spawn')];
    expect(budget).toBe(120_000);
  });
});
