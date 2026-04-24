/**
 * chatOrchestrationBridgeSendHelpers.test.ts — Smoke tests for low-level
 * send-flow helpers extracted from chatOrchestrationBridgeSend.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { failPendingSend, inheritExistingLinkFields } from './chatOrchestrationBridgeSendHelpers';
import type { AgentChatOrchestrationLink } from './types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('./chatOrchestrationBridgeSupport', () => ({
  buildSendFailureResult: vi.fn((args) => ({ success: false, ...args })),
  buildSendSuccessResult: vi.fn((args) => ({ success: true, ...args })),
  createOrchestrationFailure: vi.fn((msg) => ({ message: msg })),
  persistThreadLinkage: vi.fn(async (args) => ({ id: 'thread-1', ...args.thread })),
  buildAgentChatOrchestrationLink: vi.fn(),
  mapOrchestrationStatusToAgentChatStatus: vi.fn(() => 'idle'),
}));

vi.mock('../logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('failPendingSend', () => {
  it('returns a failure result without thread persistence when thread/messageId missing', async () => {
    const result = await failPendingSend({
      error: 'boom',
      threadStore: {} as never,
    });
    expect(result).toMatchObject({ success: false, error: 'boom' });
  });

  it('persists thread linkage and returns failure result when thread and messageId provided', async () => {
    const { persistThreadLinkage } = await import('./chatOrchestrationBridgeSupport');
    const result = await failPendingSend({
      error: 'task failed',
      messageId: 'msg-1',
      thread: { id: 'thread-1', messages: [], workspaceRoot: '/project' } as never,
      threadStore: { updateThread: vi.fn() } as never,
    });
    expect(persistThreadLinkage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', messageId: 'msg-1' }),
    );
    expect(result).toMatchObject({ success: false, error: 'task failed' });
  });

  it('includes the link in the failure result when provided', async () => {
    const link: AgentChatOrchestrationLink = { taskId: 'task-1' };
    const result = await failPendingSend({
      error: 'network error',
      link,
      threadStore: {} as never,
    });
    expect(result).toMatchObject({ orchestration: link });
  });
});

describe('inheritExistingLinkFields', () => {
  it('copies claudeSessionId from existing when target is empty', () => {
    const link: AgentChatOrchestrationLink = {};
    const existing: AgentChatOrchestrationLink = { claudeSessionId: 'claude-1' };
    inheritExistingLinkFields(link, existing);
    expect(link.claudeSessionId).toBe('claude-1');
  });

  it('does not overwrite an already-set claudeSessionId', () => {
    const link: AgentChatOrchestrationLink = { claudeSessionId: 'mine' };
    const existing: AgentChatOrchestrationLink = { claudeSessionId: 'theirs' };
    inheritExistingLinkFields(link, existing);
    expect(link.claudeSessionId).toBe('mine');
  });

  it('copies codexThreadId from existing when target is empty', () => {
    const link: AgentChatOrchestrationLink = {};
    const existing: AgentChatOrchestrationLink = { codexThreadId: 'codex-1' };
    inheritExistingLinkFields(link, existing);
    expect(link.codexThreadId).toBe('codex-1');
  });

  it('copies model and effort from existing', () => {
    const link: AgentChatOrchestrationLink = {};
    const existing: AgentChatOrchestrationLink = { model: 'sonnet', effort: 'high' };
    inheritExistingLinkFields(link, existing);
    expect(link.model).toBe('sonnet');
    expect(link.effort).toBe('high');
  });

  it('is a no-op for fields already set on link', () => {
    const link: AgentChatOrchestrationLink = { model: 'opus', effort: 'low' };
    const existing: AgentChatOrchestrationLink = { model: 'haiku', effort: 'max' };
    inheritExistingLinkFields(link, existing);
    expect(link.model).toBe('opus');
    expect(link.effort).toBe('low');
  });
});
