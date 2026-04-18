import { describe, expect, it, vi } from 'vitest';

import { enforceCapabilityOrRespond, type MobileAccessMeta } from './bridgeCapabilityGate';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSend() {
  const calls: unknown[] = [];
  const fn = vi.fn((response: unknown) => { calls.push(response); });
  return { fn, calls };
}

function makeMeta(capabilities: string[]): MobileAccessMeta {
  return {
    deviceId: 'test-device',
    capabilities: capabilities as MobileAccessMeta['capabilities'],
    issuedAt: Date.now(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('enforceCapabilityOrRespond', () => {
  it('returns true and does not send when connectionMeta is null (legacy path)', () => {
    const { fn } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 1, method: 'pty:spawn' },
      null,
      fn,
    );
    expect(result).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns true for an always-class channel with empty capabilities', () => {
    const { fn } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 2, method: 'perf:ping' },
      makeMeta([]),
      fn,
    );
    expect(result).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns false and sends error for desktop-only channel', () => {
    const { fn, calls } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 3, method: 'pty:spawn' },
      makeMeta(['paired-read', 'paired-write']),
      fn,
    );
    expect(result).toBe(false);
    expect(fn).toHaveBeenCalledOnce();
    const resp = calls[0] as { error: { code: number; message: string }; id: number };
    expect(resp.error.code).toBe(-32003);
    expect(resp.error.message).toBe('desktop-only');
    expect(resp.id).toBe(3);
  });

  it('returns true for paired-read channel with paired-read capability', () => {
    const { fn } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 4, method: 'files:readFile' },
      makeMeta(['paired-read']),
      fn,
    );
    expect(result).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns false for paired-read channel with only paired-write capability', () => {
    const { fn, calls } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 5, method: 'files:readFile' },
      makeMeta(['paired-write']),
      fn,
    );
    expect(result).toBe(false);
    expect(fn).toHaveBeenCalledOnce();
    const resp = calls[0] as { error: { code: number; message: string } };
    expect(resp.error.code).toBe(-32003);
  });

  it('returns true for paired-write channel with both capabilities', () => {
    const { fn } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 6, method: 'agentChat:sendMessage' },
      makeMeta(['paired-read', 'paired-write']),
      fn,
    );
    expect(result).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns false for unclassified channel with full capabilities', () => {
    const { fn, calls } = makeSend();
    const result = enforceCapabilityOrRespond(
      { id: 7, method: 'nonexistent:channel' },
      makeMeta(['paired-read', 'paired-write']),
      fn,
    );
    expect(result).toBe(false);
    const resp = calls[0] as { error: { message: string } };
    expect(resp.error.message).toBe('unclassified');
  });

  it('preserves the request id in the error response', () => {
    const { fn, calls } = makeSend();
    enforceCapabilityOrRespond(
      { id: 'req-abc', method: 'pty:spawn' },
      makeMeta(['paired-read']),
      fn,
    );
    const resp = calls[0] as { id: string };
    expect(resp.id).toBe('req-abc');
  });

  it('response always has jsonrpc 2.0', () => {
    const { fn, calls } = makeSend();
    enforceCapabilityOrRespond(
      { id: 8, method: 'pty:spawn' },
      makeMeta([]),
      fn,
    );
    const resp = calls[0] as { jsonrpc: string };
    expect(resp.jsonrpc).toBe('2.0');
  });
});
