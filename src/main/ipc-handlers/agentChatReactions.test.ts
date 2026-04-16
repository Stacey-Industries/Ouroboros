/**
 * agentChatReactions.test.ts — smoke tests for the reaction IPC sub-registrar.
 *
 * Tests the handler logic in isolation by exercising registerReactionHandlers
 * with a stub AgentChatService and a stub register function.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Reaction } from '@shared/types/agentChat';
import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';
import { registerReactionHandlers, type ReactionHandlerDeps } from './agentChatReactions';

// ── Stubs ────────────────────────────────────────────────────────────────────

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function makeStubs(initial: Reaction[] = []) {
  const store: { data: Reaction[] } & {
    getMessageReactions: (id: string) => Promise<Reaction[]>;
    setMessageReactions: (id: string, r: Reaction[]) => Promise<void>;
    setMessageCollapsed: (id: string, c: boolean) => Promise<void>;
    collapsedState: Map<string, boolean>;
  } = {
    data: [...initial],
    collapsedState: new Map(),
    async getMessageReactions(_id: string) { return [...store.data]; },
    async setMessageReactions(_id: string, r: Reaction[]) { store.data = [...r]; },
    async setMessageCollapsed(id: string, c: boolean) { store.collapsedState.set(id, c); },
  };

  const handlers = new Map<string, HandlerFn>();
  const channels: string[] = [];

  const register: ReactionHandlerDeps['register'] = (ch, channel, handler) => {
    ch.push(channel);
    handlers.set(channel, handler as HandlerFn);
  };

  const requireValidString: ReactionHandlerDeps['requireValidString'] = (v, name) => {
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`Invalid ${name}`);
    return v.trim();
  };

  // minimal AgentChatService stub
  const svc = { threadStore: store } as unknown as import('../agentChat').AgentChatService;

  registerReactionHandlers({ channels, svc, register, requireValidString });

  return { store, handlers, channels };
}

function call(handlers: Map<string, HandlerFn>, channel: string, ...args: unknown[]) {
  const h = handlers.get(channel);
  if (!h) throw new Error(`No handler for ${channel}`);
  return h(...args);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('registerReactionHandlers', () => {
  it('registers all four channels', () => {
    const { channels } = makeStubs();
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.getMessageReactions);
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.addMessageReaction);
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.removeMessageReaction);
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.setMessageCollapsed);
  });

  describe('getMessageReactions', () => {
    it('returns empty list when no reactions', async () => {
      const { handlers } = makeStubs();
      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.getMessageReactions, 'msg-1');
      expect(result).toEqual({ success: true, reactions: [] });
    });

    it('returns existing reactions', async () => {
      const { handlers } = makeStubs([{ kind: '+1', at: 1000 }]);
      const result = await call(
        handlers, AGENT_CHAT_INVOKE_CHANNELS.getMessageReactions, 'msg-1',
      ) as { success: boolean; reactions: Reaction[] };
      expect(result.success).toBe(true);
      expect(result.reactions).toHaveLength(1);
    });

    it('rejects missing messageId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.getMessageReactions, ''),
      ).rejects.toThrow('Invalid messageId');
    });
  });

  describe('addMessageReaction', () => {
    it('adds a +1 reaction and returns updated list', async () => {
      const { handlers } = makeStubs();
      const result = await call(
        handlers, AGENT_CHAT_INVOKE_CHANNELS.addMessageReaction, 'msg-1', '+1',
      ) as { success: boolean; reactions: Reaction[] };
      expect(result.success).toBe(true);
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0].kind).toBe('+1');
    });

    it('adds a -1 reaction', async () => {
      const { handlers } = makeStubs();
      const result = await call(
        handlers, AGENT_CHAT_INVOKE_CHANNELS.addMessageReaction, 'msg-1', '-1',
      ) as { success: boolean; reactions: Reaction[] };
      expect(result.reactions[0].kind).toBe('-1');
    });

    it('persists via the store', async () => {
      const { handlers, store } = makeStubs();
      await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.addMessageReaction, 'msg-1', '+1');
      expect(store.data).toHaveLength(1);
    });

    it('rejects missing kind', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.addMessageReaction, 'msg-1', ''),
      ).rejects.toThrow('Invalid kind');
    });
  });

  describe('removeMessageReaction', () => {
    it('removes a reaction and returns updated list', async () => {
      const { handlers } = makeStubs([{ kind: '+1', at: 1000 }]);
      const result = await call(
        handlers, AGENT_CHAT_INVOKE_CHANNELS.removeMessageReaction, 'msg-1', '+1',
      ) as { success: boolean; reactions: Reaction[] };
      expect(result.success).toBe(true);
      expect(result.reactions).toHaveLength(0);
    });

    it('is a no-op when reaction does not exist', async () => {
      const { handlers } = makeStubs([{ kind: '+1', at: 1000 }]);
      const result = await call(
        handlers, AGENT_CHAT_INVOKE_CHANNELS.removeMessageReaction, 'msg-1', 'heart',
      ) as { success: boolean; reactions: Reaction[] };
      expect(result.reactions).toHaveLength(1);
    });
  });

  describe('setMessageCollapsed', () => {
    it('sets collapsed = true', async () => {
      const { handlers, store } = makeStubs();
      const result = await call(
        handlers, AGENT_CHAT_INVOKE_CHANNELS.setMessageCollapsed, 'msg-1', true,
      );
      expect(result).toEqual({ success: true });
      expect(store.collapsedState.get('msg-1')).toBe(true);
    });

    it('sets collapsed = false', async () => {
      const { handlers, store } = makeStubs();
      await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.setMessageCollapsed, 'msg-1', false);
      expect(store.collapsedState.get('msg-1')).toBe(false);
    });

    it('rejects missing messageId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.setMessageCollapsed, '', true),
      ).rejects.toThrow('Invalid messageId');
    });
  });
});
