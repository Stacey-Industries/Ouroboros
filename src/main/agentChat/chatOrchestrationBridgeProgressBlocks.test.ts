/**
 * chatOrchestrationBridgeProgressBlocks.test.ts — Smoke tests for block-level
 * progress helpers extracted from chatOrchestrationBridgeProgress.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  ensureBlockCapacity,
  handleContentBlock,
  handleTextBlock,
  handleThinkingBlock,
  handleToolBlock,
} from './chatOrchestrationBridgeProgressBlocks';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';

// ── Minimal stubs ──────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ActiveStreamContext> = {}): ActiveStreamContext {
  return {
    threadId: 'thread-1',
    assistantMessageId: 'msg-1',
    taskId: 'task-1',
    sessionId: 'sess-1',
    link: {},
    accumulatedText: '',
    firstChunkEmitted: false,
    model: 'sonnet',
    bufferedChunks: [],
    chunkSequence: 0,
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    streamEnded: false,
    ...overrides,
  } as ActiveStreamContext;
}

function makeListeners(): AgentChatBridgeRuntime['streamChunkListeners'] {
  return new Set();
}

// Mock out side-effectful imports
vi.mock('./chatOrchestrationBridgeMonitor', () => ({
  emitStreamChunk: vi.fn(),
  emitMonitorToolStart: vi.fn(),
  emitMonitorToolEnd: vi.fn(),
  emitMonitorSubTool: vi.fn(),
}));
vi.mock('./chatOrchestrationBridgeProgressHelpers', () => ({
  logFirstChunk: vi.fn(),
  emitToolActivityChunk: vi.fn(),
}));
vi.mock('./chatOrchestrationBridgeSubTools', () => ({
  applySubToolToAccumulatedBlock: vi.fn(),
  buildSubToolStreamChunk: vi.fn(() => ({})),
  applySubAgentMessageToAccumulatedBlock: vi.fn(),
  buildSubAgentMessageStreamChunk: vi.fn(() => ({})),
}));
vi.mock('./factClaimTap', () => ({ tapTextDeltaForFactClaims: vi.fn(() => Promise.resolve()) }));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ensureBlockCapacity', () => {
  it('fills accumulatedBlocks up to blockIndex with text stubs', () => {
    const ctx = makeCtx();
    ensureBlockCapacity(ctx, 2);
    expect(ctx.accumulatedBlocks).toHaveLength(3);
    expect(ctx.accumulatedBlocks[0]).toEqual({ kind: 'text', content: '' });
  });

  it('is a no-op when capacity already sufficient', () => {
    const ctx = makeCtx({ accumulatedBlocks: [{ kind: 'text', content: 'hi' }] });
    ensureBlockCapacity(ctx, 0);
    expect(ctx.accumulatedBlocks).toHaveLength(1);
    expect(ctx.accumulatedBlocks[0]).toEqual({ kind: 'text', content: 'hi' });
  });
});

describe('handleTextBlock', () => {
  it('appends textDelta to accumulatedText and matching text block', () => {
    const ctx = makeCtx({ accumulatedBlocks: [{ kind: 'text', content: 'hello' }] });
    handleTextBlock({ ctx, listeners: makeListeners(), blockIndex: 0, now: 0 }, ' world');
    expect(ctx.accumulatedText).toBe(' world');
    expect((ctx.accumulatedBlocks[0] as { kind: 'text'; content: string }).content).toBe(
      'hello world',
    );
  });

  it('replaces a non-text block at blockIndex with a new text block', () => {
    const ctx = makeCtx({
      accumulatedBlocks: [{ kind: 'thinking', content: 'old' } as unknown as never],
    });
    handleTextBlock({ ctx, listeners: makeListeners(), blockIndex: 0, now: 0 }, 'new');
    expect(ctx.accumulatedBlocks[0]).toEqual({ kind: 'text', content: 'new' });
  });
});

describe('handleThinkingBlock', () => {
  it('appends thinkingDelta to an existing thinking block', () => {
    const ctx = makeCtx({ accumulatedBlocks: [{ kind: 'thinking', content: 'think' } as never] });
    handleThinkingBlock({ ctx, listeners: makeListeners(), blockIndex: 0, now: 0 }, ' more');
    expect((ctx.accumulatedBlocks[0] as { kind: 'thinking'; content: string }).content).toBe(
      'think more',
    );
  });

  it('creates a new thinking block when existing kind differs', () => {
    const ctx = makeCtx({ accumulatedBlocks: [{ kind: 'text', content: '' }] });
    handleThinkingBlock({ ctx, listeners: makeListeners(), blockIndex: 0, now: 0 }, 'ponder');
    expect(ctx.accumulatedBlocks[0]).toEqual({ kind: 'thinking', content: 'ponder' });
  });
});

describe('handleToolBlock', () => {
  it('handles subToolActivity path without throwing', () => {
    const ctx = makeCtx({ accumulatedBlocks: [{ kind: 'text', content: '' }] });
    expect(() =>
      handleToolBlock(
        { ctx, listeners: makeListeners(), blockIndex: 0, now: 0 },
        {
          name: 'Read',
          status: 'running',
          subToolActivity: { name: 'Read', status: 'running' },
        } as never,
      ),
    ).not.toThrow();
  });

  it('handles subAgentMessage path without throwing', () => {
    const ctx = makeCtx({ accumulatedBlocks: [{ kind: 'text', content: '' }] });
    expect(() =>
      handleToolBlock(
        { ctx, listeners: makeListeners(), blockIndex: 0, now: 0 },
        {
          name: 'Agent',
          status: 'running',
          subAgentMessage: { role: 'assistant', textDelta: 'hi' },
        } as never,
      ),
    ).not.toThrow();
  });
});

describe('handleContentBlock', () => {
  it('routes text blockType to handleTextBlock', () => {
    const ctx = makeCtx();
    handleContentBlock(ctx, makeListeners(), { blockIndex: 0, blockType: 'text', textDelta: 'yo' }, 0);
    expect(ctx.accumulatedText).toBe('yo');
    expect(ctx.firstChunkEmitted).toBe(true);
  });

  it('routes thinking blockType without mutating accumulatedText', () => {
    const ctx = makeCtx();
    handleContentBlock(
      ctx,
      makeListeners(),
      { blockIndex: 0, blockType: 'thinking', textDelta: 'deep' },
      0,
    );
    expect(ctx.accumulatedText).toBe('');
    expect(ctx.firstChunkEmitted).toBe(true);
  });

  it('is a no-op for unknown blockType', () => {
    const ctx = makeCtx();
    handleContentBlock(
      ctx,
      makeListeners(),
      { blockIndex: 0, blockType: 'unknown' as never },
      0,
    );
    expect(ctx.firstChunkEmitted).toBe(true);
  });
});
