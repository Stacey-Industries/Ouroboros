/**
 * webPreloadChatStateApi.test.ts — Smoke tests for the web-mode chat state API builder.
 *
 * Verifies that buildChatStateNewPathApi returns a correctly-wired object whose
 * invoke/on calls route to the right channel strings.
 */

import { diffChannel, errorChannel, snapshotChannel } from '@shared/ipc/chatStateChannels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildChatStateNewPathApi } from './webPreloadChatStateApi';

// ── Transport mock ────────────────────────────────────────────────────────────

function makeMockTransport() {
  return {
    invoke: vi.fn().mockResolvedValue({ success: true }),
    on: vi.fn().mockReturnValue(vi.fn()),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildChatStateNewPathApi', () => {
  let t: ReturnType<typeof makeMockTransport>;
  let api: ReturnType<typeof buildChatStateNewPathApi>;

  beforeEach(() => {
    t = makeMockTransport();
    api = buildChatStateNewPathApi(t);
  });

  it('returns an object with the expected method names', () => {
    expect(typeof api.sendMessage).toBe('function');
    expect(typeof api.requestSnapshot).toBe('function');
    expect(typeof api.onStateDiff).toBe('function');
    expect(typeof api.onSnapshot).toBe('function');
    expect(typeof api.onError).toBe('function');
    expect(typeof api.restartSession).toBe('function');
  });

  it('sendMessage invokes chatCommand:sendMessage with the payload', () => {
    const payload = { threadId: 't-1', content: 'hello', cwd: '/proj' };
    api.sendMessage(payload);
    expect(t.invoke).toHaveBeenCalledWith('chatCommand:sendMessage', payload);
  });

  it('requestSnapshot invokes chatState:requestSnapshot with wrapped threadId', () => {
    api.requestSnapshot('t-2');
    expect(t.invoke).toHaveBeenCalledWith('chatState:requestSnapshot', { threadId: 't-2' });
  });

  it('onStateDiff subscribes to diffChannel(threadId)', () => {
    const cb = vi.fn();
    api.onStateDiff('t-3', cb);
    expect(t.on).toHaveBeenCalledWith(diffChannel('t-3'), cb);
  });

  it('onSnapshot subscribes to snapshotChannel(threadId)', () => {
    const cb = vi.fn();
    api.onSnapshot('t-4', cb);
    expect(t.on).toHaveBeenCalledWith(snapshotChannel('t-4'), cb);
  });

  it('onError subscribes to errorChannel(threadId)', () => {
    const cb = vi.fn();
    api.onError('t-5', cb);
    expect(t.on).toHaveBeenCalledWith(errorChannel('t-5'), cb);
  });

  it('restartSession invokes chatCommand:restartSession with wrapped threadId', () => {
    api.restartSession('t-6');
    expect(t.invoke).toHaveBeenCalledWith('chatCommand:restartSession', { threadId: 't-6' });
  });

  it('different threadIds produce different diff subscription channels', () => {
    const cb = vi.fn();
    api.onStateDiff('thread-a', cb);
    api.onStateDiff('thread-b', cb);
    const calls = t.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain(diffChannel('thread-a'));
    expect(calls).toContain(diffChannel('thread-b'));
    expect(diffChannel('thread-a')).not.toBe(diffChannel('thread-b'));
  });

  it('onStateDiff returns the cleanup function from t.on', () => {
    const cleanup = vi.fn();
    t.on.mockReturnValueOnce(cleanup);
    const result = api.onStateDiff('t-7', vi.fn());
    expect(result).toBe(cleanup);
  });
});
