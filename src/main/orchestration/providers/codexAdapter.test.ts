/**
 * Smoke tests for CodexAdapter.
 *
 * Covers adapter surface (capabilities, cancelTask routing). Launch flow is
 * integration-tested indirectly via codexAdapterLaunchSupport.test.ts and the
 * Codex event handler / app-server runner unit suites.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('./codexAdapterHelpers', () => ({
  createCodexCapabilities: vi.fn(() => ({
    provider: 'codex',
    supportsStreaming: true,
    supportsResume: true,
    supportsStructuredEdits: false,
    supportsToolUse: true,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  })),
  getCodexTransportDecision: vi.fn(() => ({ transport: 'exec', warning: undefined })),
  resolveCodexSettings: vi.fn(() => ({
    cliArgs: [],
    model: 'gpt-5',
    settings: { sandbox: 'workspace-write', approvalPolicy: 'on-request' },
  })),
}));
vi.mock('./codexAdapterLaunchSupport', async () => {
  const activeHandles = new Map<string, { kill: () => void; threadId: string | null }>();
  const cancelledTasks = new Set<string>();
  return {
    activeHandles,
    cancelledTasks,
    emitTransportWarning: vi.fn(),
    scheduleCodexAppServerLaunch: vi.fn(),
    scheduleExecLaunch: vi.fn(),
    handleLaunchSuccess: vi.fn(),
    handleLaunchError: vi.fn(),
  };
});
vi.mock('./codexLaunch', () => ({
  buildCodexCompletionArgs: vi.fn(() => ({})),
  buildCodexEventComponents: vi.fn(() => ({
    handler: vi.fn(),
    getNextBlockIndex: vi.fn(),
    getUsage: vi.fn(),
  })),
  buildCodexLaunchResult: vi.fn(() => ({ session: { sessionId: null } })),
  buildCodexPlaceholderHandle: vi.fn(() => ({
    placeholder: { kill: vi.fn(), threadId: null },
    getCancelledBeforeLaunch: () => false,
  })),
  buildCodexSessionRef: vi.fn(() => ({ sessionId: null })),
}));

import { CodexAdapter, createCodexAdapter } from './codexAdapter';
import { activeHandles, cancelledTasks } from './codexAdapterLaunchSupport';

describe('CodexAdapter', () => {
  beforeEach(() => {
    activeHandles.clear();
    cancelledTasks.clear();
  });

  it('createCodexAdapter returns a CodexAdapter instance', () => {
    const adapter = createCodexAdapter();
    expect(adapter).toBeInstanceOf(CodexAdapter);
    expect(adapter.provider).toBe('codex');
  });

  it('getCapabilities delegates to createCodexCapabilities', () => {
    const caps = new CodexAdapter().getCapabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.supportsResume).toBe(true);
  });

  describe('cancelTask', () => {
    it('is a no-op when no id is provided', async () => {
      await new CodexAdapter().cancelTask({});
      expect(cancelledTasks.size).toBe(0);
    });

    it('kills the matching active handle by externalTaskId and marks task cancelled', async () => {
      const kill = vi.fn();
      activeHandles.set('task-1', { kill, threadId: null });

      await new CodexAdapter().cancelTask({ externalTaskId: 'task-1' });

      expect(kill).toHaveBeenCalled();
      expect(cancelledTasks.has('task-1')).toBe(true);
      expect(activeHandles.has('task-1')).toBe(false);
    });

    it('falls back to matching by threadId when no direct id match exists', async () => {
      const kill = vi.fn();
      activeHandles.set('internal-id', { kill, threadId: 'thread-42' });

      await new CodexAdapter().cancelTask({ sessionId: 'thread-42' });

      expect(kill).toHaveBeenCalled();
      expect(cancelledTasks.has('internal-id')).toBe(true);
    });

    it('prefers externalTaskId over requestId and sessionId', async () => {
      const external = vi.fn();
      const session = vi.fn();
      activeHandles.set('external-id', { kill: external, threadId: null });
      activeHandles.set('session-id', { kill: session, threadId: null });

      await new CodexAdapter().cancelTask({
        externalTaskId: 'external-id',
        sessionId: 'session-id',
      });

      expect(external).toHaveBeenCalled();
      expect(session).not.toHaveBeenCalled();
    });
  });
});
