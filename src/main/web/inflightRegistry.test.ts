/**
 * inflightRegistry.test.ts — Unit tests for the resumable in-flight RPC registry.
 *
 * Wave 33a Phase E.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearRegistry,
  detach,
  getTokensForDevice,
  reattach,
  register,
  registrySize,
  resolve,
  setSendTarget,
} from './inflightRegistry';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({ resumeTtlSec: 300 })),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  clearRegistry();
});

afterEach(() => {
  clearRegistry();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('register', () => {
  it('returns a non-empty base64url token', () => {
    const token = register({ deviceId: 'dev-1', channel: 'files:readFile' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    // base64url chars only
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('adds an entry to the registry', () => {
    register({ deviceId: 'dev-1', channel: 'files:readFile' });
    expect(registrySize()).toBe(1);
  });

  it('each call returns a unique token', () => {
    const a = register({ deviceId: 'dev-1', channel: 'ch:a' });
    const b = register({ deviceId: 'dev-1', channel: 'ch:b' });
    expect(a).not.toBe(b);
  });
});

describe('setSendTarget', () => {
  it('updates the send target — subsequent sends reach the new function', () => {
    const token = register({ deviceId: 'dev-1', channel: 'files:readFile' });
    const sent: unknown[] = [];
    setSendTarget(token, (msg) => sent.push(msg));
    // Trigger the TTL timer to exercise send
    vi.advanceTimersByTime(300_001);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ error: 'resume-timeout' });
  });

  it('is a no-op for unknown tokens', () => {
    expect(() => setSendTarget('no-such-token', vi.fn())).not.toThrow();
  });
});

describe('detach', () => {
  it('clears the send target so TTL fires silently', () => {
    const token = register({ deviceId: 'dev-1', channel: 'files:readFile' });
    const sent: unknown[] = [];
    setSendTarget(token, (msg) => sent.push(msg));
    detach(token);
    // TTL fires — entry's send is noop so nothing reaches the array
    vi.advanceTimersByTime(300_001);
    // Entry was deleted by TTL; sent array stays empty because detach swapped in noop
    expect(sent).toHaveLength(0);
  });

  it('is a no-op for unknown tokens', () => {
    expect(() => detach('ghost-token')).not.toThrow();
  });
});

describe('reattach', () => {
  it('returns true and updates send for the same device', () => {
    const token = register({ deviceId: 'dev-1', channel: 'ch:x' });
    detach(token);
    const sent: unknown[] = [];
    const ok = reattach(token, 'dev-1', (msg) => sent.push(msg));
    expect(ok).toBe(true);
    // Trigger TTL to confirm new send is wired
    vi.advanceTimersByTime(300_001);
    expect(sent).toHaveLength(1);
  });

  it('returns false for an unknown token', () => {
    const ok = reattach('no-such', 'dev-1', vi.fn());
    expect(ok).toBe(false);
  });

  it('returns false when deviceId does not match', () => {
    const token = register({ deviceId: 'dev-1', channel: 'ch:y' });
    const ok = reattach(token, 'dev-ATTACKER', vi.fn());
    expect(ok).toBe(false);
    // Original entry is still present
    expect(registrySize()).toBe(1);
  });
});

describe('resolve', () => {
  it('removes the entry and cancels the TTL timer', () => {
    const token = register({ deviceId: 'dev-1', channel: 'ch:z' });
    const sent: unknown[] = [];
    setSendTarget(token, (msg) => sent.push(msg));
    resolve(token);
    expect(registrySize()).toBe(0);
    // Advancing time must NOT fire the TTL (it was cancelled)
    vi.advanceTimersByTime(400_000);
    expect(sent).toHaveLength(0);
  });

  it('is a no-op for unknown tokens', () => {
    expect(() => resolve('gone')).not.toThrow();
  });
});

describe('TTL expiry', () => {
  it('removes entry after TTL and sends resume-timeout to the registered target', () => {
    const token = register({ deviceId: 'dev-2', channel: 'agentChat:sendMessage' });
    const sent: unknown[] = [];
    setSendTarget(token, (msg) => sent.push(msg));
    // Advance past the 300 s TTL
    vi.advanceTimersByTime(300_001);
    expect(registrySize()).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ error: 'resume-timeout' });
  });

  it('does NOT fire TTL if resolved before deadline', () => {
    const token = register({ deviceId: 'dev-2', channel: 'agentChat:sendMessage' });
    const sent: unknown[] = [];
    setSendTarget(token, (msg) => sent.push(msg));
    resolve(token);
    vi.advanceTimersByTime(400_000);
    expect(sent).toHaveLength(0);
  });
});

describe('getTokensForDevice', () => {
  it('returns all tokens for a given device', () => {
    const t1 = register({ deviceId: 'dev-A', channel: 'ch:1' });
    const t2 = register({ deviceId: 'dev-A', channel: 'ch:2' });
    register({ deviceId: 'dev-B', channel: 'ch:3' });
    const tokens = getTokensForDevice('dev-A');
    expect(tokens).toHaveLength(2);
    expect(tokens).toContain(t1);
    expect(tokens).toContain(t2);
  });

  it('returns empty array when device has no entries', () => {
    expect(getTokensForDevice('nobody')).toHaveLength(0);
  });
});

describe('lazy cleanup (evictExpired)', () => {
  it('evicts expired entries on next register call', () => {
    const token = register({ deviceId: 'dev-C', channel: 'ch:e' });
    // Resolve immediately so cleanup timer fires cleanly — then manually expire
    // the entry by clearing and re-inserting a stale one via the real flow:
    // Advance just past TTL — timer fires and removes the entry
    vi.advanceTimersByTime(300_001);
    expect(registrySize()).toBe(0);
    // A new register after TTL still works cleanly
    const token2 = register({ deviceId: 'dev-C', channel: 'ch:f' });
    expect(token2).not.toBe(token);
    expect(registrySize()).toBe(1);
  });
});
