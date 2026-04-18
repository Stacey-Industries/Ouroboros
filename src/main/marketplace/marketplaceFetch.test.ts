/**
 * marketplaceFetch.test.ts — tests for HTTPS fetch helpers.
 *
 * `node:https` is mocked at module level so no real network calls are made.
 * `signatureVerify` is mocked independently to isolate fetch logic from crypto.
 */

import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoist mock state ──────────────────────────────────────────────────────────

const { mockVerifyImpl } = vi.hoisted(() => ({
  mockVerifyImpl: vi.fn<(content: string, sig: string) => boolean>(() => false),
}));

// ── Mock node:https ───────────────────────────────────────────────────────────

type HttpsGetCallback = (res: EventEmitter & { on: (e: string, cb: (d?: Buffer) => void) => void }) => void;

let httpsGetFactory: (url: string, cb: HttpsGetCallback) => EventEmitter;

vi.mock('node:https', () => ({
  default: {
    get: (url: string, cb: HttpsGetCallback) => httpsGetFactory(url, cb),
  },
}));

// ── Mock signatureVerify ──────────────────────────────────────────────────────

vi.mock('./signatureVerify', () => ({
  verifyBundleSignature: (content: string, sig: string) => mockVerifyImpl(content, sig),
}));

vi.mock('./trustedKeys', () => ({
  TRUSTED_PUBLIC_KEY_BASE64: 'REPLACE_WITH_PRODUCTION_KEY',
  MARKETPLACE_MANIFEST_URL: 'https://example.com/index.json',
  REVOKED_BUNDLES_URL: 'https://example.com/revoked-bundles.json',
}));

import { fetchBundle, fetchManifest, fetchRevokedIds, httpsGet } from './marketplaceFetch';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSuccessFactory(body: string): typeof httpsGetFactory {
  return (_url, cb) => {
    const res = new EventEmitter() as EventEmitter & { on: (e: string, cb: (d?: Buffer) => void) => void };
    const req = new EventEmitter();
    (req as unknown as { setTimeout: (ms: number, fn: () => void) => void }).setTimeout = () => {};
    setImmediate(() => {
      cb(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return req;
  };
}

function makeErrorFactory(message: string): typeof httpsGetFactory {
  return (_url, cb) => {
    const req = new EventEmitter();
    (req as unknown as { setTimeout: (ms: number, fn: () => void) => void }).setTimeout = () => {};
    setImmediate(() => {
      void cb; // suppress unused
      req.emit('error', new Error(message));
    });
    return req;
  };
}

// ── fetchManifest ─────────────────────────────────────────────────────────────

describe('fetchManifest', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyImpl.mockReturnValue(false); });

  it('returns bundles array on valid JSON', async () => {
    httpsGetFactory = makeSuccessFactory(JSON.stringify({ bundles: [{ id: 'a' }] }));
    const result = await fetchManifest('https://example.com/index.json');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.bundles).toHaveLength(1);
  });

  it('returns error when JSON has no bundles array', async () => {
    httpsGetFactory = makeSuccessFactory('{"notBundles":true}');
    const result = await fetchManifest('https://example.com/index.json');
    expect('error' in result).toBe(true);
  });

  it('returns error on network failure', async () => {
    httpsGetFactory = makeErrorFactory('ENOTFOUND');
    const result = await fetchManifest('https://example.com/index.json');
    expect('error' in result).toBe(true);
  });

  it('returns error on invalid JSON', async () => {
    httpsGetFactory = makeSuccessFactory('not-json{{{');
    const result = await fetchManifest('https://example.com/index.json');
    expect('error' in result).toBe(true);
  });
});

// ── fetchBundle ───────────────────────────────────────────────────────────────

const ENTRY = {
  id: 'test-bundle', title: 'Test', description: 'desc', author: 'author',
  kind: 'theme' as const, version: '1.0.0', signature: 'sig==',
  downloadUrl: 'https://example.com/test-bundle.json',
};

describe('fetchBundle', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyImpl.mockReturnValue(false); });

  it('returns error when signature is invalid', async () => {
    httpsGetFactory = makeSuccessFactory(JSON.stringify({ id: 'test-bundle', kind: 'theme', payload: {} }));
    mockVerifyImpl.mockReturnValue(false);
    const result = await fetchBundle(ENTRY);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('invalid-signature');
  });

  it('returns BundleContent when signature is valid', async () => {
    const body = JSON.stringify({ id: 'test-bundle', kind: 'theme', payload: {} });
    httpsGetFactory = makeSuccessFactory(body);
    mockVerifyImpl.mockReturnValue(true);
    const result = await fetchBundle(ENTRY);
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.id).toBe('test-bundle');
  });

  it('returns error on network failure', async () => {
    httpsGetFactory = makeErrorFactory('ENOTFOUND');
    const result = await fetchBundle(ENTRY);
    expect('error' in result).toBe(true);
  });
});

// ── fetchRevokedIds ───────────────────────────────────────────────────────────

describe('fetchRevokedIds', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns ids array from valid response', async () => {
    httpsGetFactory = makeSuccessFactory(JSON.stringify({ ids: ['a', 'b'] }));
    const result = await fetchRevokedIds('https://example.com/revoked-bundles.json');
    expect(result.ids).toEqual(['a', 'b']);
  });

  it('returns empty ids on network failure (best-effort)', async () => {
    httpsGetFactory = makeErrorFactory('offline');
    const result = await fetchRevokedIds('https://example.com/revoked-bundles.json');
    expect(result.ids).toEqual([]);
  });

  it('returns empty ids when response shape is wrong', async () => {
    httpsGetFactory = makeSuccessFactory('{"revoked":[]}');
    const result = await fetchRevokedIds('https://example.com/revoked-bundles.json');
    expect(result.ids).toEqual([]);
  });
});

// ── httpsGet export ───────────────────────────────────────────────────────────

describe('httpsGet export', () => {
  it('is a function', () => {
    expect(typeof httpsGet).toBe('function');
  });
});
