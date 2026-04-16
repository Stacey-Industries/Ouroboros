/**
 * agentChatEventForwarders.test.ts — Smoke tests for the event forwarder helpers.
 *
 * makeSafeSend() and registerEventForwarders() are integration-heavy (they
 * need Electron windows + a live bridge). We test the pure structural contract:
 * - makeSafeSend returns a callable function
 * - registerEventForwarders registers session-update + stream-chunk subscriptions
 *   (verified via the cleanup callbacks it pushes onto cleanupFns)
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { makeSafeSend, registerEventForwarders } from './agentChatEventForwarders';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../agentChat', () => ({
  AGENT_CHAT_EVENT_CHANNELS: {
    thread: 'agentChat:thread',
    status: 'agentChat:status',
    stream: 'agentChat:stream',
  },
}));

vi.mock('../agentChat/chatOrchestrationBridgeSupport', () => ({
  buildAgentChatOrchestrationLink: vi.fn(() => null),
  mapOrchestrationStatusToAgentChatStatus: vi.fn(() => 'idle'),
}));

vi.mock('../agentChat/eventProjector', () => ({
  projectAgentChatSession: vi.fn(async () => ({
    changed: false,
    thread: { id: 't1', updatedAt: 1 },
    latestMessageId: undefined,
  })),
}));

vi.mock('../agentChat/threadStore', () => ({
  agentChatThreadStore: {},
}));

vi.mock('../logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));

vi.mock('../windowManager', () => ({
  getAllActiveWindows: vi.fn(() => []),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

let broadcastMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const webServer = await import('../web/webServer');
  broadcastMock = vi.mocked(webServer.broadcastToWebClients);
});

describe('makeSafeSend', () => {
  it('returns a function', () => {
    expect(typeof makeSafeSend()).toBe('function');
  });

  it('does not throw when called with no active windows', () => {
    const send = makeSafeSend();
    expect(() => send('agentChat:stream', { data: 'chunk' })).not.toThrow();
  });

  it('no-ops when channel is undefined', () => {
    broadcastMock.mockClear();
    const send = makeSafeSend();
    send(undefined, { data: 'chunk' });
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});

describe('registerEventForwarders', () => {
  it('pushes exactly two cleanup functions onto cleanupFns', () => {
    const cleanupFns: Array<() => void> = [];

    const mockOrch = {
      onSessionUpdate: vi.fn(() => vi.fn()),
      cancelTask: vi.fn(),
    };

    const mockBridge = {
      onStreamChunk: vi.fn(() => vi.fn()),
      findThreadIdForSession: vi.fn(),
      findTaskIdForThread: vi.fn(),
      getActiveThreadIds: vi.fn(() => []),
      registerPendingCancel: vi.fn(),
    };

    const mockSvc = {
      bridge: mockBridge,
      loadThread: vi.fn(async () => ({ success: false })),
      createThread: vi.fn(),
      deleteThread: vi.fn(),
      listThreads: vi.fn(),
      sendMessage: vi.fn(),
      getLinkedDetails: vi.fn(),
      getBufferedChunks: vi.fn(),
      cancelTask: vi.fn(),
      branchThread: vi.fn(),
      resumeLatestThread: vi.fn(),
      revertToSnapshot: vi.fn(),
      threadStore: {} as never,
    } as never;

    registerEventForwarders(mockSvc, mockOrch as never, cleanupFns);

    expect(cleanupFns).toHaveLength(2);
    expect(mockOrch.onSessionUpdate).toHaveBeenCalledOnce();
    expect(mockBridge.onStreamChunk).toHaveBeenCalledOnce();
  });

  it('returned cleanup fns are callable without throwing', () => {
    const cleanupFns: Array<() => void> = [];

    const mockOrch = { onSessionUpdate: vi.fn(() => vi.fn()) };
    const mockBridge = { onStreamChunk: vi.fn(() => vi.fn()) };
    const mockSvc = { bridge: mockBridge, loadThread: vi.fn() } as never;

    registerEventForwarders(mockSvc, mockOrch as never, cleanupFns);

    for (const fn of cleanupFns) {
      expect(() => fn()).not.toThrow();
    }
  });
});
