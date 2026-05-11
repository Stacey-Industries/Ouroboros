/**
 * chatStateChannels.test.ts — contract tests for the Wave 86 chat-state IPC
 * channel constants.
 *
 * These tests lock the channel name contract so that main-process and
 * renderer-process consumers cannot drift apart. If a string changes here,
 * it must change everywhere — that's the point.
 */

import { describe, expect, it } from 'vitest';

import { CHAT_STATE_CHANNELS, diffChannel, snapshotChannel } from './chatStateChannels';

describe('CHAT_STATE_CHANNELS constants', () => {
  it('sendMessage is chatCommand:sendMessage', () => {
    expect(CHAT_STATE_CHANNELS.sendMessage).toBe('chatCommand:sendMessage');
  });

  it('requestSnapshot is chatState:requestSnapshot', () => {
    expect(CHAT_STATE_CHANNELS.requestSnapshot).toBe('chatState:requestSnapshot');
  });

  it('diffPrefix is chatState:diff', () => {
    expect(CHAT_STATE_CHANNELS.diffPrefix).toBe('chatState:diff');
  });

  it('snapshotPrefix is chatState:snapshot', () => {
    expect(CHAT_STATE_CHANNELS.snapshotPrefix).toBe('chatState:snapshot');
  });
});

describe('diffChannel()', () => {
  it('appends threadId with a colon separator', () => {
    expect(diffChannel('t-abc')).toBe('chatState:diff:t-abc');
  });

  it('produces a distinct channel per threadId', () => {
    expect(diffChannel('thread-1')).not.toBe(diffChannel('thread-2'));
  });

  it('uses the shared prefix — not a hardcoded string', () => {
    const result = diffChannel('x');
    expect(result.startsWith(CHAT_STATE_CHANNELS.diffPrefix)).toBe(true);
  });
});

describe('snapshotChannel()', () => {
  it('appends threadId with a colon separator', () => {
    expect(snapshotChannel('t-abc')).toBe('chatState:snapshot:t-abc');
  });

  it('produces a distinct channel per threadId', () => {
    expect(snapshotChannel('thread-1')).not.toBe(snapshotChannel('thread-2'));
  });

  it('uses the shared prefix — not a hardcoded string', () => {
    const result = snapshotChannel('x');
    expect(result.startsWith(CHAT_STATE_CHANNELS.snapshotPrefix)).toBe(true);
  });
});
