/**
 * preloadSupplementalChatStateApis.test.ts — smoke tests for the chatStateNewPath
 * preload bridge. Verifies IPC channel names and subscription cleanup semantics.
 */

import { CHAT_STATE_CHANNELS, diffChannel } from '@shared/ipc/chatStateChannels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(() => Promise.resolve({ success: true })),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { ipcRenderer } from 'electron';

import { chatStateNewPathApi } from './preloadSupplementalChatStateApis';

describe('chatStateNewPathApi.sendMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invokes chatCommand:sendMessage with the payload', async () => {
    const payload = {
      threadId: 't1',
      workspaceRoot: '/tmp',
      content: 'hello',
      metadata: { source: 'composer' as const },
    };
    await chatStateNewPathApi.sendMessage(payload);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(CHAT_STATE_CHANNELS.sendMessage, payload);
  });
});

describe('chatStateNewPathApi.cancelTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invokes chatCommand:cancelTurn with turnId wrapped in object', async () => {
    await chatStateNewPathApi.cancelTurn('turn-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(CHAT_STATE_CHANNELS.cancelTurn, {
      turnId: 'turn-1',
    });
  });
});

describe('chatStateNewPathApi.requestSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invokes chatState:requestSnapshot with threadId wrapped in object', async () => {
    await chatStateNewPathApi.requestSnapshot('t1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(CHAT_STATE_CHANNELS.requestSnapshot, {
      threadId: 't1',
    });
  });
});

describe('chatStateNewPathApi.onStateDiff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscribes to the thread-scoped diff channel', () => {
    const cb = vi.fn();
    chatStateNewPathApi.onStateDiff('t1', cb);
    expect(ipcRenderer.on).toHaveBeenCalledWith(diffChannel('t1'), expect.any(Function));
  });

  it('returns a cleanup function that removes the listener', () => {
    const cb = vi.fn();
    const unsub = chatStateNewPathApi.onStateDiff('t1', cb);
    unsub();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      diffChannel('t1'),
      expect.any(Function),
    );
  });

  it('uses a different channel per thread', () => {
    const cb = vi.fn();
    chatStateNewPathApi.onStateDiff('thread-a', cb);
    chatStateNewPathApi.onStateDiff('thread-b', cb);
    const channels = vi.mocked(ipcRenderer.on).mock.calls.map(([ch]) => ch);
    expect(channels).toContain(diffChannel('thread-a'));
    expect(channels).toContain(diffChannel('thread-b'));
  });
});
