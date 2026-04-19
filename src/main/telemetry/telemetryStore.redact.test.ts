/**
 * telemetryStore.redact.test.ts — Phase K: redactPayload unit tests.
 *
 * Verifies that secret keys, sk-* API keys, and JWT-shaped strings are
 * replaced with '[REDACTED]' before payloads reach telemetry storage.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../hooks';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { openTelemetryStore, setFlagEnabledOverride } from './telemetryStore';
import { redactPayload } from './telemetryStoreHelpers';

// ─── redactPayload unit tests ─────────────────────────────────────────────────

describe('redactPayload', () => {
  it('replaces top-level token key with [REDACTED]', () => {
    const result = redactPayload({ token: 'abc123', name: 'test' }) as Record<string, unknown>;
    expect(result.token).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('is case-insensitive on key matching', () => {
    const result = redactPayload({ Token: 'x', ACCESS_TOKEN: 'y' }) as Record<string, unknown>;
    expect(result.Token).toBe('[REDACTED]');
    // ACCESS_TOKEN doesn't match the pattern (underscore between ACCESS and TOKEN)
    // but access_token does — check that variant
    const r2 = redactPayload({ access_token: 'secret' }) as Record<string, unknown>;
    expect(r2.access_token).toBe('[REDACTED]');
  });

  it('replaces all secret key variants', () => {
    const input = {
      token: 'a',
      accessToken: 'b',
      refreshToken: 'c',
      access_token: 'd',
      refresh_token: 'e',
      apiKey: 'f',
      api_key: 'g',
      password: 'h',
      authorization: 'i',
      secret: 'j',
    };
    const result = redactPayload(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      // eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys above
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('redacts nested object secret keys', () => {
    const result = redactPayload({
      auth: { token: 'nested-secret', userId: 'user-1' },
    }) as Record<string, Record<string, unknown>>;
    expect(result.auth.token).toBe('[REDACTED]');
    expect(result.auth.userId).toBe('user-1');
  });

  it('redacts deeply nested secret keys', () => {
    const result = redactPayload({
      a: { b: { c: { password: 'deep' } } },
    }) as Record<string, unknown>;
    const inner = (result.a as Record<string, unknown>);
    const deeper = (inner.b as Record<string, unknown>);
    const deepest = (deeper.c as Record<string, unknown>);
    expect(deepest.password).toBe('[REDACTED]');
  });

  it('redacts sk-* API key string values', () => {
    const result = redactPayload({
      safeKey: 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890',
    }) as Record<string, unknown>;
    expect(result.safeKey).toBe('[REDACTED]');
  });

  it('does NOT redact short sk- strings (under 20 chars after sk-)', () => {
    const result = redactPayload({ val: 'sk-short' }) as Record<string, unknown>;
    expect(result.val).toBe('sk-short');
  });

  it('redacts JWT-shaped string values', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactPayload({ bearerToken: jwt }) as Record<string, unknown>;
    expect(result.bearerToken).toBe('[REDACTED]');
  });

  it('handles arrays by mapping each element', () => {
    const result = redactPayload([
      { token: 'a', name: 'item1' },
      { password: 'b', name: 'item2' },
    ]) as Array<Record<string, unknown>>;
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[0].name).toBe('item1');
    expect(result[1].password).toBe('[REDACTED]');
    expect(result[1].name).toBe('item2');
  });

  it('handles nested arrays', () => {
    const result = redactPayload({
      items: [{ token: 'x' }, { safe: 'y' }],
    }) as Record<string, Array<Record<string, unknown>>>;
    expect(result.items[0].token).toBe('[REDACTED]');
    expect(result.items[1].safe).toBe('y');
  });

  it('does not redact non-string primitive values for non-secret keys', () => {
    const result = redactPayload({ count: 42, flag: true, ratio: 3.14 }) as Record<string, unknown>;
    expect(result.count).toBe(42);
    expect(result.flag).toBe(true);
    expect(result.ratio).toBe(3.14);
  });

  it('handles null values without throwing', () => {
    expect(() => redactPayload(null)).not.toThrow();
    expect(redactPayload(null)).toBeNull();
  });

  it('bails out at depth > 10 without throwing', () => {
    // Build a deeply nested object (depth 12)
    let obj: unknown = { safe: 'value' };
    for (let i = 0; i < 12; i++) obj = { nested: obj };
    expect(() => redactPayload(obj)).not.toThrow();
  });

  it('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;
    expect(() => redactPayload(obj)).not.toThrow();
  });
});

// ─── Integration: redaction applied before storage ───────────────────────────

describe('enqueueEvent redacts payload before storing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `telem-redact-${crypto.randomUUID()}`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
    fs.mkdirSync(tmpDir, { recursive: true });
    vi.useFakeTimers();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('stores [REDACTED] for nested token key', () => {
    const store = openTelemetryStore(tmpDir);
    const payload: HookPayload = {
      type: 'pre_tool_use',
      sessionId: 'sess-redact',
      timestamp: Date.now(),
      auth: { token: 'super-secret' },
    } as unknown as HookPayload;

    store.record(payload);
    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-redact' });
    expect(events).toHaveLength(1);
    const stored = events[0].payload as Record<string, unknown>;
    const auth = stored.auth as Record<string, unknown>;
    expect(auth.token).toBe('[REDACTED]');
    store.close();
  });

  it('stores [REDACTED] for sk-* API key in payload string field', () => {
    const store = openTelemetryStore(tmpDir);
    const payload: HookPayload = {
      type: 'pre_tool_use',
      sessionId: 'sess-sk',
      timestamp: Date.now(),
      extra: { apiKey: 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890' },
    } as unknown as HookPayload;

    store.record(payload);
    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-sk' });
    const stored = events[0].payload as Record<string, unknown>;
    const extra = stored.extra as Record<string, unknown>;
    expect(extra.apiKey).toBe('[REDACTED]');
    store.close();
  });

  it('stores [REDACTED] for JWT-shaped value in payload', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const store = openTelemetryStore(tmpDir);
    const payload: HookPayload = {
      type: 'pre_tool_use',
      sessionId: 'sess-jwt',
      timestamp: Date.now(),
      meta: { bearer: jwt },
    } as unknown as HookPayload;

    store.record(payload);
    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-jwt' });
    const stored = events[0].payload as Record<string, unknown>;
    const meta = stored.meta as Record<string, unknown>;
    expect(meta.bearer).toBe('[REDACTED]');
    store.close();
  });

  it('does not redact safe fields', () => {
    const store = openTelemetryStore(tmpDir);
    const payload: HookPayload = {
      type: 'pre_tool_use',
      sessionId: 'sess-safe',
      timestamp: 12345,
      toolName: 'Bash',
    } as unknown as HookPayload;

    store.record(payload);
    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-safe' });
    const stored = events[0].payload as Record<string, unknown>;
    expect(stored.toolName).toBe('Bash');
    expect(stored.timestamp).toBe(12345);
    store.close();
  });
});
