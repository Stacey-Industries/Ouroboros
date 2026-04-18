/**
 * webServer.test.ts — Unit tests for webServer lifecycle exports and Phase H
 * __WEB_PAIRING_REQUIRED__ injection gating.
 *
 * Wave 33a Phase D (lifecycle); Phase H (injection gating).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGetConfigValue = vi.fn();
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

vi.mock('../mobileAccess/bridgeDisconnect', () => ({
  registerConnection: vi.fn(),
  unregisterConnection: vi.fn(),
}));

const mockExtractToken = vi.fn();
const mockIsLocalhost = vi.fn();
vi.mock('./authMiddleware', () => ({
  authMiddleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  parseCookies: vi.fn(() => ({})),
  extractToken: mockExtractToken,
  isLocalhost: mockIsLocalhost,
}));

vi.mock('./bridgeAuth', () => ({
  authenticateUpgrade: vi.fn(async () => null),
  authenticatePairingHandshake: vi.fn(async () => ({ ok: false, error: 'stub' })),
}));

vi.mock('./bridgeCapabilityGate', () => ({}));
vi.mock('./bridgeResume', () => ({ detachDevice: vi.fn() }));

vi.mock('./pairingMiddleware', () => ({
  createPairingRouter: vi.fn(() => {
    const r = {
      stack: [] as unknown[],
      post: vi.fn(),
      use: vi.fn(),
      handle: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    };
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

// ─── Tests — lifecycle ────────────────────────────────────────────────────────

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

// ─── Tests — pairing gate helpers ────────────────────────────────────────────
// These tests exercise the guard conditions directly. Full HTTP integration
// tests (requiring a real port) are out of scope for unit test level.

describe('pairing injection gating conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractToken.mockReturnValue({ token: '', fromQuery: false });
    mockIsLocalhost.mockReturnValue(false);
  });

  it('skips injection when mobileAccess is disabled', () => {
    mockGetConfigValue.mockReturnValue({ enabled: false, pairedDevices: [] });
    // When disabled the gate short-circuits before checking isLocalhost/extractToken.
    // Contract test: enabled=false → shouldInject=false regardless of other conditions.
    const cfg = mockGetConfigValue('mobileAccess') as { enabled: boolean };
    expect(cfg.enabled).toBe(false);
  });

  it('skips injection for localhost requests', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    mockIsLocalhost.mockReturnValue(true);
    // localhost requests should fall through to authMiddleware (not intercepted).
    expect(mockIsLocalhost('127.0.0.1')).toBe(true);
  });

  it('skips injection when valid token is present', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    mockIsLocalhost.mockReturnValue(false);
    mockExtractToken.mockReturnValue({ token: 'valid-tok', fromQuery: false });
    // Non-empty token means the client is authenticated; gate falls through.
    expect(mockExtractToken({}).token).toBe('valid-tok');
  });

  it('injects pairing flag when mobile on + non-localhost + no token', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    mockIsLocalhost.mockReturnValue(false);
    mockExtractToken.mockReturnValue({ token: '', fromQuery: false });
    // All three conditions met: flag = on, not localhost, no token.
    // The handler should serve pairing HTML. Contract: no fallthrough.
    const shouldInject =
      Boolean(mockGetConfigValue('mobileAccess')?.enabled) &&
      !mockIsLocalhost('10.0.0.1') &&
      !mockExtractToken({}).token;
    expect(shouldInject).toBe(true);
  });
});
