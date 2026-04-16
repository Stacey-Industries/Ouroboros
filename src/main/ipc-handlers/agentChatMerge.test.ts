/**
 * agentChatMerge.test.ts — Wave 23 Phase D
 * Smoke tests for the mergeSideChat IPC sub-registrar.
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';
import { describe, expect, it, vi } from 'vitest';

import { type MergeHandlerDeps, registerMergeHandlers } from './agentChatMerge';

// ── Stubs ─────────────────────────────────────────────────────────────────────

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function makeStubs(overrides: {
  mergeSideChat?: (p: unknown) => Promise<unknown>;
} = {}) {
  const mergeSideChat =
    overrides.mergeSideChat ??
    vi.fn().mockResolvedValue({ success: true, systemMessageId: 'msg-1' });

  const store = { mergeSideChat };
  const svc = { threadStore: store } as unknown as import('../agentChat').AgentChatService;

  const handlers = new Map<string, HandlerFn>();
  const channels: string[] = [];

  const register: MergeHandlerDeps['register'] = (ch, channel, handler) => {
    ch.push(channel);
    handlers.set(channel, handler as HandlerFn);
  };

  const requireValidString: MergeHandlerDeps['requireValidString'] = (v, name) => {
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`Invalid ${name}`);
    return v.trim();
  };

  const requireValidObject: MergeHandlerDeps['requireValidObject'] = (v, name) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(`Invalid ${name}`);
    }
    return v as Record<string, unknown>;
  };

  registerMergeHandlers({ channels, svc, register, requireValidString, requireValidObject });

  return { store, handlers, channels };
}

function call(handlers: Map<string, HandlerFn>, channel: string, ...args: unknown[]) {
  const h = handlers.get(channel);
  if (!h) throw new Error(`No handler for ${channel}`);
  return h(...args);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerMergeHandlers', () => {
  it('registers the mergeSideChat channel', () => {
    const { channels } = makeStubs();
    expect(channels).toContain(AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat);
  });

  describe('mergeSideChat', () => {
    it('calls threadStore.mergeSideChat with parsed params and returns result', async () => {
      const mergeSideChat = vi.fn().mockResolvedValue({ success: true, systemMessageId: 'abc' });
      const { handlers } = makeStubs({ mergeSideChat });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Key findings.',
      }) as { success: boolean; systemMessageId: string };

      expect(result.success).toBe(true);
      expect(result.systemMessageId).toBe('abc');
      expect(mergeSideChat).toHaveBeenCalledWith({
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Key findings.',
        includeMessageIds: undefined,
      });
    });

    it('passes includeMessageIds when provided', async () => {
      const mergeSideChat = vi.fn().mockResolvedValue({ success: true, systemMessageId: 'abc' });
      const { handlers } = makeStubs({ mergeSideChat });

      await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Summary.',
        includeMessageIds: ['msg-a', 'msg-b'],
      });

      expect(mergeSideChat).toHaveBeenCalledWith(
        expect.objectContaining({ includeMessageIds: ['msg-a', 'msg-b'] }),
      );
    });

    it('filters non-string entries out of includeMessageIds', async () => {
      const mergeSideChat = vi.fn().mockResolvedValue({ success: true });
      const { handlers } = makeStubs({ mergeSideChat });

      await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Summary.',
        includeMessageIds: ['msg-a', 42, null, 'msg-b'],
      });

      expect(mergeSideChat).toHaveBeenCalledWith(
        expect.objectContaining({ includeMessageIds: ['msg-a', 'msg-b'] }),
      );
    });

    it('returns { success: false } when the store throws', async () => {
      const mergeSideChat = vi.fn().mockRejectedValue(new Error('Thread not found: side-1'));
      const { handlers } = makeStubs({ mergeSideChat });

      const result = await call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Summary.',
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Thread not found');
    });

    it('throws on missing sideChatId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
          sideChatId: '',
          mainThreadId: 'main-1',
          summary: 'Summary.',
        }),
      ).rejects.toThrow('Invalid sideChatId');
    });

    it('throws on missing mainThreadId', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
          sideChatId: 'side-1',
          mainThreadId: '',
          summary: 'Summary.',
        }),
      ).rejects.toThrow('Invalid mainThreadId');
    });

    it('throws on missing summary', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, {
          sideChatId: 'side-1',
          mainThreadId: 'main-1',
          summary: '',
        }),
      ).rejects.toThrow('Invalid summary');
    });

    it('throws when payload is not an object', async () => {
      const { handlers } = makeStubs();
      await expect(
        call(handlers, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, 'not-an-object'),
      ).rejects.toThrow('Invalid mergeSideChat payload');
    });
  });
});
