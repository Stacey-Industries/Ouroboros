/**
 * bridgeDisconnect.test.ts — Tests for the real bridge disconnect implementation.
 *
 * Covers register/unregister/disconnect round-trip per the Phase D spec.
 *
 * Wave 33a Phase D.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  disconnectDevice,
  getTrackedConnectionCount,
  registerConnection,
  unregisterConnection,
} = await import('./bridgeDisconnect');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockWs(readyState = 1 /* OPEN */): { ws: WebSocket; closeArgs: [number, string][] } {
  const closeArgs: [number, string][] = [];
  const ws = {
    readyState,
    close: (code: number, reason: string) => closeArgs.push([code, reason]),
  } as unknown as WebSocket;
  return { ws, closeArgs };
}

// Clean up between tests by unregistering any leftover sockets.
afterEach(() => {
  // Nothing to reset — each test uses unique device IDs.
});

// ─── registerConnection ───────────────────────────────────────────────────────

describe('registerConnection', () => {
  it('tracks a single connection for a device', () => {
    const { ws } = makeMockWs();
    const before = getTrackedConnectionCount();
    registerConnection('dev-register-1', ws);
    expect(getTrackedConnectionCount()).toBe(before + 1);
    unregisterConnection(ws);
  });

  it('tracks multiple connections for the same device', () => {
    const { ws: ws1 } = makeMockWs();
    const { ws: ws2 } = makeMockWs();
    const before = getTrackedConnectionCount();
    registerConnection('dev-multi-1', ws1);
    registerConnection('dev-multi-1', ws2);
    expect(getTrackedConnectionCount()).toBe(before + 2);
    unregisterConnection(ws1);
    unregisterConnection(ws2);
  });

  it('tracks connections for different devices independently', () => {
    const { ws: wsA } = makeMockWs();
    const { ws: wsB } = makeMockWs();
    const before = getTrackedConnectionCount();
    registerConnection('dev-a', wsA);
    registerConnection('dev-b', wsB);
    expect(getTrackedConnectionCount()).toBe(before + 2);
    unregisterConnection(wsA);
    unregisterConnection(wsB);
  });
});

// ─── unregisterConnection ─────────────────────────────────────────────────────

describe('unregisterConnection', () => {
  it('decrements tracked count after unregister', () => {
    const { ws } = makeMockWs();
    registerConnection('dev-unreg-1', ws);
    const after = getTrackedConnectionCount();
    unregisterConnection(ws);
    expect(getTrackedConnectionCount()).toBe(after - 1);
  });

  it('is safe to call for an untracked socket (no-op)', () => {
    const { ws } = makeMockWs();
    expect(() => unregisterConnection(ws)).not.toThrow();
  });

  it('removes device key when last connection is unregistered', () => {
    const { ws } = makeMockWs();
    const before = getTrackedConnectionCount();
    registerConnection('dev-last-1', ws);
    unregisterConnection(ws);
    expect(getTrackedConnectionCount()).toBe(before);
  });

  it('does not affect other devices when one socket is unregistered', () => {
    const { ws: wsA } = makeMockWs();
    const { ws: wsB } = makeMockWs();
    registerConnection('dev-keep-1', wsA);
    registerConnection('dev-keep-2', wsB);
    const countBefore = getTrackedConnectionCount();
    unregisterConnection(wsA);
    expect(getTrackedConnectionCount()).toBe(countBefore - 1);
    unregisterConnection(wsB);
  });
});

// ─── disconnectDevice ─────────────────────────────────────────────────────────

describe('disconnectDevice', () => {
  it('returns 0 when no connections are registered for a device', () => {
    expect(disconnectDevice('dev-unknown-999')).toBe(0);
  });

  it('closes a single socket with code 4002 and reason "revoked"', () => {
    const { ws, closeArgs } = makeMockWs();
    registerConnection('dev-revoke-1', ws);
    const count = disconnectDevice('dev-revoke-1');
    expect(count).toBe(1);
    expect(closeArgs).toHaveLength(1);
    expect(closeArgs[0]).toEqual([4002, 'revoked']);
  });

  it('closes all sockets for a device and returns correct count', () => {
    const { ws: ws1, closeArgs: c1 } = makeMockWs();
    const { ws: ws2, closeArgs: c2 } = makeMockWs();
    registerConnection('dev-revoke-2', ws1);
    registerConnection('dev-revoke-2', ws2);
    const count = disconnectDevice('dev-revoke-2');
    expect(count).toBe(2);
    expect(c1[0]).toEqual([4002, 'revoked']);
    expect(c2[0]).toEqual([4002, 'revoked']);
  });

  it('does not affect connections for other devices', () => {
    const { ws: wsTarget } = makeMockWs();
    const { ws: wsOther, closeArgs: otherClose } = makeMockWs();
    registerConnection('dev-target', wsTarget);
    registerConnection('dev-other', wsOther);
    disconnectDevice('dev-target');
    expect(otherClose).toHaveLength(0);
    unregisterConnection(wsOther);
  });

  it('does not throw when close() throws on an individual socket', () => {
    const ws = {
      readyState: 1,
      close: () => { throw new Error('socket already gone'); },
    } as unknown as WebSocket;
    registerConnection('dev-throw-1', ws);
    expect(() => disconnectDevice('dev-throw-1')).not.toThrow();
  });

  it('returns 0 for an empty string deviceId', () => {
    expect(disconnectDevice('')).toBe(0);
  });
});

// ─── round-trip ───────────────────────────────────────────────────────────────

describe('register / disconnect / unregister round-trip', () => {
  it('count returns to baseline after disconnect and unregister', () => {
    const { ws } = makeMockWs();
    const baseline = getTrackedConnectionCount();
    registerConnection('dev-roundtrip-1', ws);
    expect(getTrackedConnectionCount()).toBe(baseline + 1);
    disconnectDevice('dev-roundtrip-1');
    // ws.close() was called but unregister happens via 'close' event in production;
    // in tests we call it manually to verify the count path.
    unregisterConnection(ws);
    expect(getTrackedConnectionCount()).toBe(baseline);
  });
});
