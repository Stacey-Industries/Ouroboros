/**
 * agentChat.test.ts — Smoke tests for the agentChat IPC handler registrar.
 *
 * The registrar is integration-heavy (Electron ipcMain, AgentChatService,
 * orchestration bridge). We test the structural contract:
 * - registerAgentChatHandlers returns a non-empty channel list
 * - cleanupAgentChatHandlers runs without throwing
 * - Each expected channel name is present in the returned list
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../agentChat', () => ({
  AGENT_CHAT_INVOKE_CHANNELS: {
    createThread: 'agentChat:createThread',
    deleteThread: 'agentChat:deleteThread',
    loadThread: 'agentChat:loadThread',
    listThreads: 'agentChat:listThreads',
    branchThread: 'agentChat:branchThread',
    resumeLatestThread: 'agentChat:resumeLatestThread',
    revertToSnapshot: 'agentChat:revertToSnapshot',
    sendMessage: 'agentChat:sendMessage',
    getLinkedDetails: 'agentChat:getLinkedDetails',
    getBufferedChunks: 'agentChat:getBufferedChunks',
    cancelTask: 'agentChat:cancelTask',
    cancelByThreadId: 'agentChat:cancelByThreadId',
    getLinkedTerminal: 'agentChat:getLinkedTerminal',
    listMemories: 'agentChat:listMemories',
    createMemory: 'agentChat:createMemory',
    updateMemory: 'agentChat:updateMemory',
    deleteMemory: 'agentChat:deleteMemory',
    getThreadTags: 'agentChat:getThreadTags',
    setThreadTags: 'agentChat:setThreadTags',
    searchThreads: 'agentChat:searchThreads',
  },
  AGENT_CHAT_EVENT_CHANNELS: {
    thread: 'agentChat:thread',
    status: 'agentChat:status',
    stream: 'agentChat:stream',
  },
  createAgentChatService: vi.fn(() => ({
    createThread: vi.fn(),
    deleteThread: vi.fn(),
    loadThread: vi.fn(async () => ({ success: false })),
    listThreads: vi.fn(),
    branchThread: vi.fn(),
    resumeLatestThread: vi.fn(),
    revertToSnapshot: vi.fn(),
    sendMessage: vi.fn(),
    getLinkedDetails: vi.fn(),
    getBufferedChunks: vi.fn(),
    bridge: {
      findTaskIdForThread: vi.fn(),
      findThreadIdForSession: vi.fn(),
      getActiveThreadIds: vi.fn(() => []),
      registerPendingCancel: vi.fn(),
      onStreamChunk: vi.fn(() => vi.fn()),
    },
    threadStore: {
      getTags: vi.fn(async () => []),
      setTags: vi.fn(async () => undefined),
      searchThreads: vi.fn(() => []),
    },
  })),
}));

vi.mock('../pty', () => ({
  getLinkedSessionIds: vi.fn(() => []),
}));

vi.mock('../agentChat/sessionMemory', () => ({
  sessionMemoryStore: {
    loadMemories: vi.fn(async () => []),
    createEntry: vi.fn(() => ({ id: 'mem1' })),
    saveMemories: vi.fn(async () => undefined),
    updateEntry: vi.fn(async () => undefined),
    deleteEntry: vi.fn(async () => false),
  },
}));

vi.mock('./agentChatContext', () => ({
  invalidateSnapshotCache: vi.fn(),
  loadPersistedContextCache: vi.fn(),
  startContextRefreshTimer: vi.fn(),
  stopContextRefreshTimer: vi.fn(),
  terminateContextWorker: vi.fn(),
  warmSnapshotCache: vi.fn(),
}));

vi.mock('./agentChatEventForwarders', () => ({
  registerEventForwarders: vi.fn(),
}));

vi.mock('./agentChatOrchestration', () => ({
  createMinimalOrchestration: vi.fn(() => ({
    cancelTask: vi.fn(),
    onSessionUpdate: vi.fn(() => vi.fn()),
  })),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerAgentChatHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a non-empty array of channel strings', async () => {
    const { registerAgentChatHandlers } = await import('./agentChat');
    const channels = registerAgentChatHandlers();
    expect(Array.isArray(channels)).toBe(true);
    expect(channels.length).toBeGreaterThan(0);
  });

  it('includes the searchThreads channel', async () => {
    const { registerAgentChatHandlers } = await import('./agentChat');
    const channels = registerAgentChatHandlers();
    expect(channels).toContain('agentChat:searchThreads');
  });

  it('includes thread CRUD channels', async () => {
    const { registerAgentChatHandlers } = await import('./agentChat');
    const channels = registerAgentChatHandlers();
    expect(channels).toContain('agentChat:createThread');
    expect(channels).toContain('agentChat:deleteThread');
    expect(channels).toContain('agentChat:loadThread');
    expect(channels).toContain('agentChat:listThreads');
  });

  it('includes tag channels', async () => {
    const { registerAgentChatHandlers } = await import('./agentChat');
    const channels = registerAgentChatHandlers();
    expect(channels).toContain('agentChat:getThreadTags');
    expect(channels).toContain('agentChat:setThreadTags');
  });

  it('can be called twice without throwing (re-registration)', async () => {
    const { registerAgentChatHandlers } = await import('./agentChat');
    expect(() => {
      registerAgentChatHandlers();
      registerAgentChatHandlers();
    }).not.toThrow();
  });
});

describe('cleanupAgentChatHandlers', () => {
  it('runs without throwing', async () => {
    const { registerAgentChatHandlers, cleanupAgentChatHandlers } = await import('./agentChat');
    registerAgentChatHandlers();
    expect(() => cleanupAgentChatHandlers()).not.toThrow();
  });

  it('can be called before registration without throwing', async () => {
    const { cleanupAgentChatHandlers } = await import('./agentChat');
    expect(() => cleanupAgentChatHandlers()).not.toThrow();
  });
});
