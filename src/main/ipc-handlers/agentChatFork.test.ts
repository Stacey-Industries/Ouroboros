/**
 * agentChatFork.test.ts — smoke tests for the fork/branch IPC sub-registrar.
 *
 * Tests handler logic in isolation with a stub AgentChatService and a stub
 * register function — no Electron, no SQLite.
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';
import type { BranchNode } from '@shared/types/agentChat';
import { describe, expect, it, vi } from 'vitest';

import { type ForkHandlerDeps,registerForkHandlers } from './agentChatFork';

// ── Stubs ─────────────────────────────────────────────────────────────────────

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function makeStubs(overrides: {
  forkThread?: (p: unknown) => Promise<unknown>;
  renameBranch?: (id: string, name: string) => Promise<void>;
  listBranches?: (rootId: string) => Promise<BranchNode[]>;
} = {}) {
  const forkThread = overrides.forkThread ?? vi.fn().mockResolvedValue({ id: 'fork-id' });
  const renameBranch = overrides.renameBranch ?? vi.fn().mockResolvedValue(undefined);
  const listBranches = overrides.listBranches ?? vi.fn().mockResolvedValue([]);

  const store = { forkThread, renameBranch, listBranches };
  const svc = { threadStore: store } as unknown as import('../agentChat').AgentChatService;

  const handlers = new Map<string, HandlerFn>();
  const channels: string[] = [];

  const register: ForkHandlerDeps['register'] = (ch, channel, handler) => {
    ch.push(channel);
    handlers.set(channel, handler as HandlerFn);
  };

  const requireValidString: ForkHandlerDeps['requireValidString'] = (v, name) => {
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`Invalid ${name}`);
    return v.trim();
  };

  const requireValidObject: ForkHandlerDeps['requireValidObject'] = (v, name) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(`Invalid ${name}`);
    }
    return v as Record<string, unknown>;
  };

  registerForkHandlers({ channels, svc, register, requireValidString, requireValidObject });

  return { store, handlers, channels };
}

function call(handlers: Map<string, HandlerFn>, channel: string, ...args: unknown[]) {
  const h = handlers.get(channel);
  if (!h) throw new Error(`No handler for ${channel}`);
  return h(...args);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerForkHandlers', () => {
  it('registers all three channels', () => {
    const { channels } = makeStubs();
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.forkThread);
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.renameBranch);
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.listBranches);
  });

  describe('forkThread', () => {
    it('calls threadStore.forkThread with the parsed payload', async () => {
      const forkThread = vi.fn().mockResolvedValue({ id: 'fork-id' });
      const { handlers } = makeStubs({ forkThread });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.forkThread, {
        sourceThreadId: 'src',
        fromMessageId: 'msg-1',
        includeHistory: true,
        isSideChat: false,
      }) as { success: boolean; threadId: string };

      expect(result.success).toBe(true);
      expect(result.threadId).toBe('fork-id');
      expect(forkThread).toHaveBeenCalledWith({
        sourceThreadId: 'src',
        fromMessageId: 'msg-1',
        includeHistory: true,
        isSideChat: false,
      });
    });

    it('sets isSideChat to true when provided', async () => {
      const forkThread = vi.fn().mockResolvedValue({ id: 'side-id' });
      const { handlers } = makeStubs({ forkThread });

      await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.forkThread, {
        sourceThreadId: 'src',
        fromMessageId: 'msg-1',
        includeHistory: false,
        isSideChat: true,
      });

      expect(forkThread).toHaveBeenCalledWith(
        expect.objectContaining({ isSideChat: true }),
      );
    });

    it('returns { success: false } when the store throws', async () => {
      const forkThread = vi.fn().mockRejectedValue(new Error('Thread not found: src'));
      const { handlers } = makeStubs({ forkThread });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.forkThread, {
        sourceThreadId: 'src',
        fromMessageId: 'msg-1',
        includeHistory: true,
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Thread not found');
    });

    it('throws on missing sourceThreadId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.forkThread, {
          sourceThreadId: '',
          fromMessageId: 'msg-1',
          includeHistory: true,
        }),
      ).rejects.toThrow('Invalid sourceThreadId');
    });

    it('throws on missing fromMessageId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.forkThread, {
          sourceThreadId: 'src',
          fromMessageId: '',
          includeHistory: true,
        }),
      ).rejects.toThrow('Invalid fromMessageId');
    });

    it('throws when payload is not an object', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.forkThread, 'not-an-object'),
      ).rejects.toThrow('Invalid forkThread payload');
    });
  });

  describe('renameBranch', () => {
    it('calls threadStore.renameBranch with threadId and name', async () => {
      const renameBranch = vi.fn().mockResolvedValue(undefined);
      const { handlers } = makeStubs({ renameBranch });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.renameBranch, {
        threadId: 'thread-1',
        name: 'my feature branch',
      }) as { success: boolean };

      expect(result.success).toBe(true);
      expect(renameBranch).toHaveBeenCalledWith('thread-1', 'my feature branch');
    });

    it('returns { success: false } when the store throws', async () => {
      const renameBranch = vi.fn().mockRejectedValue(new Error('oops'));
      const { handlers } = makeStubs({ renameBranch });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.renameBranch, {
        threadId: 'thread-1',
        name: 'my branch',
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('oops');
    });

    it('throws on missing threadId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.renameBranch, {
          threadId: '',
          name: 'branch',
        }),
      ).rejects.toThrow('Invalid threadId');
    });
  });

  describe('listBranches', () => {
    it('calls threadStore.listBranches and returns the tree', async () => {
      const node: BranchNode = {
        id: 'child-1',
        isSideChat: false,
        children: [],
      };
      const listBranches = vi.fn().mockResolvedValue([node]);
      const { handlers } = makeStubs({ listBranches });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.listBranches, {
        rootThreadId: 'root',
      }) as { success: boolean; branches: BranchNode[] };

      expect(result.success).toBe(true);
      expect(result.branches).toHaveLength(1);
      expect(result.branches[0].id).toBe('child-1');
      expect(listBranches).toHaveBeenCalledWith('root');
    });

    it('returns empty array when no branches exist', async () => {
      const { handlers } = makeStubs();

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.listBranches, {
        rootThreadId: 'root',
      }) as { success: boolean; branches: BranchNode[] };

      expect(result.success).toBe(true);
      expect(result.branches).toHaveLength(0);
    });

    it('returns { success: false } when the store throws', async () => {
      const listBranches = vi.fn().mockRejectedValue(new Error('db error'));
      const { handlers } = makeStubs({ listBranches });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.listBranches, {
        rootThreadId: 'root',
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('db error');
    });

    it('throws on missing rootThreadId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.listBranches, {
          rootThreadId: '',
        }),
      ).rejects.toThrow('Invalid rootThreadId');
    });
  });
});
