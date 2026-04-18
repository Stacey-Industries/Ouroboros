/**
 * webServer.test.ts — Smoke tests for webServer lifecycle exports.
 *
 * Full HTTP/WS integration tests require a real port; these unit-level tests
 * verify: broadcastToWebClients no-ops when no clients, getWebClientCount
 * returns 0 initially, getWebServerPort returns null before start.
 *
 * Wave 33a Phase D.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({ enabled: false, pairedDevices: [] })),
}));

vi.mock('../mobileAccess/bridgeDisconnect', () => ({
  registerConnection: vi.fn(),
  unregisterConnection: vi.fn(),
}));

vi.mock('./authMiddleware', () => ({
  authMiddleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  parseCookies: vi.fn(() => ({})),
}));

vi.mock('./bridgeAuth', () => ({
  authenticateUpgrade: vi.fn(async () => null),
  authenticatePairingHandshake: vi.fn(async () => ({ ok: false, error: 'stub' })),
}));

vi.mock('./bridgeCapabilityGate', () => ({}));

vi.mock('./pairingMiddleware', () => ({
  createPairingRouter: vi.fn(() => {
    const r = { stack: [] as unknown[], post: vi.fn() };
    return r;
  }),
}));

vi.mock('./webAuth', () => ({
  consumeWsTicket: vi.fn(() => false),
  createWsTicket: vi.fn(() => ({ ticket: 'tk', expiresInMs: 30000 })),
  getOrCreateWebToken: vi.fn(() => 'test-token'),
  isRateLimited: vi.fn(() => false),
  recordFailedAttempt: vi.fn(),
  validateCredential: vi.fn(() => false),
  validateToken: vi.fn(() => false),
  verifyRefreshToken: vi.fn(() => ({ device: null, reason: 'disabled' })),
}));

vi.mock('./webSocketBridge', () => ({
  handleJsonRpcMessage: vi.fn(),
}));

const {
  broadcastToWebClients,
  getWebClientCount,
  getWebServerPort,
} = await import('./webServer');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getWebServerPort', () => {
  it('returns null before server has started', () => {
    expect(getWebServerPort()).toBeNull();
  });
});

describe('getWebClientCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 0 when no clients are connected', () => {
    expect(getWebClientCount()).toBe(0);
  });
});

describe('broadcastToWebClients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not throw when no clients are connected', () => {
    expect(() => broadcastToWebClients('test:event', { data: 1 })).not.toThrow();
  });

  it('does not throw for an empty channel string', () => {
    expect(() => broadcastToWebClients('', null)).not.toThrow();
  });
});
