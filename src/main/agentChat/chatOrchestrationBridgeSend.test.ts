/**
 * chatOrchestrationBridgeSend.test.ts — Smoke tests for the task send flow.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildStreamContext, finalizeStartedTask, persistCreatedLink } from './chatOrchestrationBridgeSend';
import type { AgentChatOrchestrationLink } from './types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../hooks', () => ({ beginChatSessionLaunch: vi.fn() }));
vi.mock('../logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('./chatOrchestrationBridgeGit', () => ({ captureHeadHash: vi.fn(async () => null) }));
vi.mock('./chatOrchestrationBridgeMonitor', () => ({
  startIncrementalFlush: vi.fn(),
  stopIncrementalFlush: vi.fn(),
}));
vi.mock('./chatOrchestrationBridgeSupport', () => ({
  buildAgentChatOrchestrationLink: vi.fn(() => null),
  buildAssistantMessageId: vi.fn((id: string) => `assist-${id}`),
  buildSendSuccessResult: vi.fn((a) => ({ success: true, ...a })),
  buildSendFailureResult: vi.fn((a) => ({ success: false, ...a })),
  mapOrchestrationStatusToAgentChatStatus: vi.fn(() => 'running'),
  persistThreadLinkage: vi.fn(async ({ thread }) => thread),
  createOrchestrationFailure: vi.fn((m) => ({ message: m })),
}));
vi.mock('./chatOrchestrationBridgeSendHelpers', () => ({
  failPendingSend: vi.fn(async (a) => ({ success: false, error: a.error })),
  inheritExistingLinkFields: vi.fn(),
}));
vi.mock('./tokenCalibration', () => ({
  tokenCalibrationStore: { calibrate: vi.fn((n: number) => n) },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeThread(overrides = {}) {
  return {
    id: 'thread-1',
    messages: [{ role: 'user', content: 'hello' }],
    workspaceRoot: '/project',
    latestOrchestration: null,
    ...overrides,
  };
}

// ── buildStreamContext ────────────────────────────────────────────────────────

describe('buildStreamContext', () => {
  it('populates required fields from pending and created', () => {
    const pending = {
      thread: makeThread(),
      taskRequest: { model: 'sonnet', conversationHistory: [] },
      messageId: 'msg-1',
    } as never;
    const created = {
      taskId: 'task-1',
      session: { id: 'sess-1' },
    } as never;
    const link: AgentChatOrchestrationLink = { taskId: 'task-1' };

    const ctx = buildStreamContext({
      pending,
      created,
      link,
      assistantMessageId: 'assist-task-1',
    });

    expect(ctx.threadId).toBe('thread-1');
    expect(ctx.taskId).toBe('task-1');
    expect(ctx.sessionId).toBe('sess-1');
    expect(ctx.model).toBe('sonnet');
    expect(ctx.accumulatedText).toBe('');
    expect(ctx.streamEnded).toBe(false);
  });

  it('truncates userPrompt to 120 chars', () => {
    const longPrompt = 'x'.repeat(200);
    const pending = {
      thread: makeThread({ messages: [{ role: 'user', content: longPrompt }] }),
      taskRequest: { model: 'sonnet', conversationHistory: [] },
      messageId: 'msg-1',
    } as never;
    const ctx = buildStreamContext({
      pending,
      created: { taskId: 'task-1', session: { id: 's' } } as never,
      link: {},
      assistantMessageId: 'a',
    });
    expect(ctx.userPrompt?.length).toBe(120);
  });
});

// ── persistCreatedLink ────────────────────────────────────────────────────────

describe('persistCreatedLink', () => {
  it('returns a link and thread', async () => {
    const thread = makeThread();
    const pending = {
      thread,
      messageId: 'msg-1',
      routedBy: undefined,
    } as never;
    const created = { taskId: 'task-1', session: { id: 'sess-1' } } as never;
    const threadStore = {} as never;

    const result = await persistCreatedLink({ created, pending, threadStore });

    expect(result.link).toBeDefined();
    expect(result.thread).toBeDefined();
  });
});

// ── finalizeStartedTask ───────────────────────────────────────────────────────

describe('finalizeStartedTask', () => {
  it('returns failure when started.success is false', async () => {
    const result = await finalizeStartedTask({
      fallbackLink: { taskId: 'task-1' },
      linkedThread: makeThread() as never,
      pending: { messageId: 'msg-1' } as never,
      started: { success: false, error: 'start failed', session: null } as never,
      threadStore: {} as never,
    });
    expect(result.success).toBe(false);
  });

  it('returns success when started.success is true', async () => {
    const { buildSendSuccessResult } = await import('./chatOrchestrationBridgeSupport');
    await finalizeStartedTask({
      fallbackLink: { taskId: 'task-1' },
      linkedThread: makeThread() as never,
      pending: { messageId: 'msg-1' } as never,
      started: { success: true, session: { id: 'sess-1', status: 'running' } } as never,
      threadStore: {} as never,
    });
    expect(buildSendSuccessResult).toHaveBeenCalled();
  });
});
