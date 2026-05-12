/**
 * chatStateNewPath.test.ts — smoke tests for the new chat orchestration IPC handlers.
 *
 * Tests the feature-flag gate (requireNewPath) and the handler registrar.
 * Full integration tests (subprocess wiring, broadcaster fan-out) belong in
 * the agentChat subsystem tests, not here.
 */

import { CHAT_STATE_CHANNELS } from '@shared/ipc/chatStateChannels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../agentChat/chatStateBroadcaster', () => ({
  ChatStateBroadcaster: vi.fn(function () {
    this.dispatch = vi.fn();
    this.subscribe = vi.fn(() => vi.fn());
    this.snapshot = vi.fn();
    this.ensureThread = vi.fn();
    this.emitError = vi.fn();
    this.resetThread = vi.fn();
  }),
}));

vi.mock('../agentChat/eventNormalizer', () => ({
  EventNormalizer: vi.fn(function () {
    this.fromCommand = vi.fn(() => ({ type: 'turn_submitted' }));
    this.fromStreamJson = vi.fn(() => null);
  }),
}));

vi.mock('../agentChat/identityRegistry', () => ({
  IdentityRegistry: vi.fn(function () {
    this.registerTurn = vi.fn();
    this.assignProviderSession = vi.fn();
    this.retireTurn = vi.fn();
    this.getActiveTurn = vi.fn();
    this.getProviderSession = vi.fn();
    this.threadIdForTurn = vi.fn();
    this.threadIdForProviderSession = vi.fn();
  }),
}));

vi.mock('../orchestration/providers/claudeStreamJsonRunner', () => ({
  spawnStreamJsonProcess: vi.fn(() => ({
    result: Promise.resolve(),
    kill: vi.fn(),
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ipcMain } from 'electron';

import { getConfigValue } from '../config';
import { registerChatStateNewPathHandlers } from './chatStateNewPath';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerChatStateNewPathHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers chatCommand:sendMessage and chatState:requestSnapshot', () => {
    registerChatStateNewPathHandlers();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(CHAT_STATE_CHANNELS.sendMessage);
    expect(ipcMain.handle).toHaveBeenCalledWith(
      CHAT_STATE_CHANNELS.sendMessage,
      expect.any(Function),
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(CHAT_STATE_CHANNELS.requestSnapshot);
    expect(ipcMain.handle).toHaveBeenCalledWith(
      CHAT_STATE_CHANNELS.requestSnapshot,
      expect.any(Function),
    );
  });

  it('returns all three channel names', () => {
    const channels = registerChatStateNewPathHandlers();
    expect(channels).toContain(CHAT_STATE_CHANNELS.sendMessage);
    expect(channels).toContain(CHAT_STATE_CHANNELS.requestSnapshot);
    expect(channels).toContain(CHAT_STATE_CHANNELS.restartSession);
    expect(channels).toHaveLength(3);
  });
});

describe('chatCommand:sendMessage handler — feature flag gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when useNewStateMachine is false', async () => {
    vi.mocked(getConfigValue).mockReturnValue({
      chatOrchestration: { useNewStateMachine: false },
    } as never);

    registerChatStateNewPathHandlers();

    // Extract the handler registered for chatCommand:sendMessage.
    const handleCall = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === CHAT_STATE_CHANNELS.sendMessage);
    expect(handleCall).toBeDefined();
    const handler = handleCall![1] as (
      event: Electron.IpcMainInvokeEvent,
      payload: unknown,
    ) => Promise<unknown>;

    const fakeEvent = { sender: {} } as Electron.IpcMainInvokeEvent;
    await expect(
      handler(fakeEvent, { threadId: 't1', content: 'hi', cwd: '/tmp' }),
    ).rejects.toThrow('chatStateNewPath: useNewStateMachine flag is false');
  });

  it('passes the flag gate when agentChatSettings is missing (defaults to enabled)', async () => {
    // Phase 5 decision: missing settings → useNewStateMachine defaults to true.
    // undefined?.chatOrchestration?.useNewStateMachine !== false → true (enabled).
    vi.mocked(getConfigValue).mockReturnValue(undefined as never);

    registerChatStateNewPathHandlers();

    const handleCall = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === CHAT_STATE_CHANNELS.sendMessage);
    const handler = handleCall![1] as (
      event: Electron.IpcMainInvokeEvent,
      payload: unknown,
    ) => Promise<unknown>;

    const fakeEvent = { sender: {} } as Electron.IpcMainInvokeEvent;
    // Handler proceeds past the flag gate — it will reject for unrelated mock
    // reasons, but NOT with the 'flag is false' message.
    const result = handler(fakeEvent, { threadId: 't1', content: 'hi', cwd: '/tmp' });
    await expect(result).rejects.not.toThrow('chatStateNewPath: useNewStateMachine flag is false');
  });
});

describe('chatState:requestSnapshot handler — feature flag gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when useNewStateMachine is false', () => {
    vi.mocked(getConfigValue).mockReturnValue({
      chatOrchestration: { useNewStateMachine: false },
    } as never);

    registerChatStateNewPathHandlers();

    const handleCall = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === CHAT_STATE_CHANNELS.requestSnapshot);
    expect(handleCall).toBeDefined();
    const handler = handleCall![1] as (
      event: Electron.IpcMainInvokeEvent,
      payload: unknown,
    ) => unknown;

    const fakeEvent = {} as Electron.IpcMainInvokeEvent;
    expect(() => handler(fakeEvent, { threadId: 't1' })).toThrow(
      'chatStateNewPath: useNewStateMachine flag is false',
    );
  });
});
