/**
 * chatStateNewPath.test.ts — smoke tests for the new chat orchestration IPC handlers.
 *
 * Phase 6: feature-flag gate removed. Tests cover handler registration only.
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

