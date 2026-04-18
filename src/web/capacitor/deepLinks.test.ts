/**
 * deepLinks.test.ts — Unit tests for the deep-link parsing bridge.
 *
 * Wave 33b Phase E.
 *
 * All parsing helpers are pure — no Capacitor runtime needed. The native
 * listener test mocks @capacitor/app and the isNative façade.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// vi.hoisted runs before any imports — values are available to vi.mock factories.
const mocked = vi.hoisted(() => {
  const mockRemove = vi.fn(async () => undefined);
  type UrlCb = (e: { url: string }) => void;
  // Explicit param types let the mock factory call pass two args without lint errors.
  const mockAddListener = vi.fn(async (
    _event: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    _cb: UrlCb,     // eslint-disable-line @typescript-eslint/no-unused-vars
  ) => ({ remove: mockRemove }));
  const mockIsNative = vi.fn(() => false);
  return { mockRemove, mockAddListener, mockIsNative };
});

vi.mock('./index', () => ({
  isNative: () => mocked.mockIsNative(),
}));

// Fully replace @capacitor/app so no native runtime code is loaded.
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (
      ...args: [string, (e: { url: string }) => void]
    ) => mocked.mockAddListener(...args),
  },
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  initDeepLinkListener,
  parsePairingUrl,
  readPairingQueryParams,
} from './deepLinks';

// ─── parsePairingUrl ───────────────────────────────────────────────────────────

describe('parsePairingUrl', () => {
  it('parses a valid ouroboros://pair URL', () => {
    const result = parsePairingUrl(
      'ouroboros://pair?host=192.168.1.50&port=4173&code=123456&fingerprint=abcdef',
    );
    expect(result).toEqual({
      host: '192.168.1.50',
      port: '4173',
      code: '123456',
      fingerprint: 'abcdef',
    });
  });

  it('returns null for wrong scheme', () => {
    expect(
      parsePairingUrl('https://pair?host=192.168.1.50&port=4173&code=123456&fingerprint=abc'),
    ).toBeNull();
  });

  it('returns null for wrong host segment', () => {
    expect(
      parsePairingUrl('ouroboros://connect?host=192.168.1.50&port=4173&code=123456&fingerprint=abc'),
    ).toBeNull();
  });

  it('returns null when host param is missing', () => {
    expect(
      parsePairingUrl('ouroboros://pair?port=4173&code=123456&fingerprint=abc'),
    ).toBeNull();
  });

  it('returns null when port param is missing', () => {
    expect(
      parsePairingUrl('ouroboros://pair?host=192.168.1.50&code=123456&fingerprint=abc'),
    ).toBeNull();
  });

  it('returns null when code param is missing', () => {
    expect(
      parsePairingUrl('ouroboros://pair?host=192.168.1.50&port=4173&fingerprint=abc'),
    ).toBeNull();
  });

  it('returns null when fingerprint param is missing', () => {
    expect(
      parsePairingUrl('ouroboros://pair?host=192.168.1.50&port=4173&code=123456'),
    ).toBeNull();
  });

  it('returns null for a completely invalid URL string', () => {
    expect(parsePairingUrl('not-a-url')).toBeNull();
  });

  it('tolerates extra unknown params alongside required ones', () => {
    const result = parsePairingUrl(
      'ouroboros://pair?host=10.0.0.1&port=7890&code=000000&fingerprint=fp&extra=ignored',
    );
    expect(result).not.toBeNull();
    expect(result?.host).toBe('10.0.0.1');
  });
});

// ─── readPairingQueryParams ────────────────────────────────────────────────────

describe('readPairingQueryParams', () => {
  it('parses a full query string', () => {
    const result = readPairingQueryParams(
      '?host=192.168.1.50&port=4173&code=654321&fingerprint=fp-xyz',
    );
    expect(result).toEqual({
      host: '192.168.1.50',
      port: '4173',
      code: '654321',
      fingerprint: 'fp-xyz',
    });
  });

  it('returns null when no relevant fields are present', () => {
    expect(readPairingQueryParams('?foo=bar&baz=qux')).toBeNull();
  });

  it('returns null for empty search string', () => {
    expect(readPairingQueryParams('')).toBeNull();
  });

  it('returns null when fingerprint is missing', () => {
    expect(
      readPairingQueryParams('?host=192.168.1.50&port=4173&code=123456'),
    ).toBeNull();
  });

  it('returns null when code is missing', () => {
    expect(
      readPairingQueryParams('?host=192.168.1.50&port=4173&fingerprint=fp'),
    ).toBeNull();
  });

  it('parses without leading ? (bare query string)', () => {
    const result = readPairingQueryParams(
      'host=10.0.0.1&port=7890&code=111111&fingerprint=abc',
    );
    expect(result).not.toBeNull();
    expect(result?.code).toBe('111111');
  });
});

// ─── initDeepLinkListener ─────────────────────────────────────────────────────

describe('initDeepLinkListener', () => {
  beforeEach(() => {
    mocked.mockIsNative.mockReturnValue(false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a no-op cleanup immediately on web (non-native)', async () => {
    mocked.mockIsNative.mockReturnValue(false);
    const onPair = vi.fn();
    const cleanup = await initDeepLinkListener(onPair);
    expect(mocked.mockAddListener).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('subscribes to appUrlOpen on native and returns a cleanup', async () => {
    mocked.mockIsNative.mockReturnValue(true);
    const onPair = vi.fn();
    const cleanup = await initDeepLinkListener(onPair);
    expect(mocked.mockAddListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
    cleanup();
    expect(mocked.mockRemove).toHaveBeenCalled();
  });

  it('calls onPair when a matching URL arrives on native', async () => {
    mocked.mockIsNative.mockReturnValue(true);
    const onPair = vi.fn();
    await initDeepLinkListener(onPair);

    // Simulate the native runtime firing the listener
    const cb = (mocked.mockAddListener.mock.calls[0] as [string, (e: { url: string }) => void])[1];
    cb({ url: 'ouroboros://pair?host=10.0.0.1&port=7890&code=042819&fingerprint=fp' });

    expect(onPair).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: '7890',
      code: '042819',
      fingerprint: 'fp',
    });
  });

  it('does not call onPair when URL scheme does not match', async () => {
    mocked.mockIsNative.mockReturnValue(true);
    const onPair = vi.fn();
    await initDeepLinkListener(onPair);

    const cb = (mocked.mockAddListener.mock.calls[0] as [string, (e: { url: string }) => void])[1];
    cb({ url: 'https://example.com/some-path' });

    expect(onPair).not.toHaveBeenCalled();
  });

  it('does not call onPair when required fields are missing', async () => {
    mocked.mockIsNative.mockReturnValue(true);
    const onPair = vi.fn();
    await initDeepLinkListener(onPair);

    const cb = (mocked.mockAddListener.mock.calls[0] as [string, (e: { url: string }) => void])[1];
    cb({ url: 'ouroboros://pair?host=10.0.0.1&port=7890' }); // no code or fingerprint

    expect(onPair).not.toHaveBeenCalled();
  });
});
