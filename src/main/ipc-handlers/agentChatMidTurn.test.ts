/**
 * agentChatMidTurn.test.ts — Tests for registerMidTurnHandlers.
 *
 * Verifies that the mid-turn injection handler calls injectWarmUserMessage
 * with the correct arguments and returns the expected success/failure shapes.
 */

import { describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../agentChat', () => ({
  AGENT_CHAT_INVOKE_CHANNELS: {
    injectMidTurn: 'agentChat:injectMidTurn',
  },
}));

vi.mock('../orchestration/providers/claudeWarmProcessManager', () => ({
  injectWarmUserMessage: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerFn = (...args: unknown[]) => unknown;

function buildHarness() {
  const registered: Array<{ channel: string; handler: HandlerFn }> = [];

  function register(channels: string[], channel: string, handler: HandlerFn): void {
    channels.push(channel);
    registered.push({ channel, handler });
  }

  function requireValidString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Invalid ${name}: expected non-empty string`);
    }
    return value.trim();
  }

  function getHandler(channel: string): HandlerFn | undefined {
    return registered.find((r) => r.channel === channel)?.handler;
  }

  return { register, requireValidString, getHandler, channels: [] as string[] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerMidTurnHandlers', () => {
  it('registers the agentChat:injectMidTurn channel', async () => {
    const { registerMidTurnHandlers } = await import('./agentChatMidTurn');
    const h = buildHarness();
    registerMidTurnHandlers(h.channels, h.register, h.requireValidString);
    expect(h.channels).toContain('agentChat:injectMidTurn');
  });

  it('calls injectWarmUserMessage with taskId and content', async () => {
    const { registerMidTurnHandlers } = await import('./agentChatMidTurn');
    const { injectWarmUserMessage } =
      await import('../orchestration/providers/claudeWarmProcessManager');
    const h = buildHarness();
    registerMidTurnHandlers(h.channels, h.register, h.requireValidString);

    const handler = h.getHandler('agentChat:injectMidTurn');
    expect(handler).toBeDefined();

    const result = await handler!('task-abc', 'hello mid-turn');
    expect(injectWarmUserMessage).toHaveBeenCalledWith('task-abc', 'hello mid-turn');
    expect(result).toEqual({ success: true });
  });

  it('throws (propagates error) when taskId is empty', async () => {
    const { registerMidTurnHandlers } = await import('./agentChatMidTurn');
    const h = buildHarness();
    registerMidTurnHandlers(h.channels, h.register, h.requireValidString);

    const handler = h.getHandler('agentChat:injectMidTurn');
    expect(() => handler!('', 'content')).toThrow('taskId');
  });

  it('throws (propagates error) when content is empty', async () => {
    const { registerMidTurnHandlers } = await import('./agentChatMidTurn');
    const h = buildHarness();
    registerMidTurnHandlers(h.channels, h.register, h.requireValidString);

    const handler = h.getHandler('agentChat:injectMidTurn');
    expect(() => handler!('task-xyz', '')).toThrow('content');
  });
});
