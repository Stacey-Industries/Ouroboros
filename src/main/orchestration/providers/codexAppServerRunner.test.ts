import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./codexApprovalBridge', () => ({
  CodexApprovalBridge: class {
    private readonly client: {
      respondToApproval: (
        requestId: string,
        response: { decision: 'approve' | 'reject'; reason?: string },
      ) => Promise<void>;
    };

    constructor(options: {
      client: {
        respondToApproval: (
          requestId: string,
          response: { decision: 'approve' | 'reject'; reason?: string },
        ) => Promise<void>;
      };
    }) {
      this.client = options.client;
    }

    async queueApproval(payload: { id?: string }): Promise<'approve'> {
      await this.client.respondToApproval(payload.id ?? 'missing-id', { decision: 'approve' });
      return 'approve';
    }

    cancelAllPendingApprovals(): void {
      /* noop */
    }
  },
}));

import {
  runCodexAppServerTurn,
  setCodexAppServerRuntimeForTests,
} from './codexAppServerRunner';
import { createProviderSessionReference, type ProviderProgressSink } from './providerAdapter';
import type { ProviderProgressEvent } from '../types';
import type { ProviderLaunchContext } from './providerAdapter';

class FakeClient {
  readonly requests: Array<{ method: string; params?: Record<string, unknown> }> = [];
  readonly responses: Array<{ id: number | string; result: Record<string, unknown> }> = [];
  private notificationListener:
    | ((message: { id?: number | string; method?: string; params?: Record<string, unknown> }) => void)
    | null = null;
  private serverRequestListener:
    | ((message: { id?: number | string; method?: string; params?: Record<string, unknown> }) => void)
    | null = null;

  emit(message: { id?: number | string; method?: string; params?: Record<string, unknown> }): void {
    if (message.id !== undefined && message.method?.includes('requestApproval')) {
      this.serverRequestListener?.(message);
      return;
    }
    this.notificationListener?.(message);
  }

  onNotification(
    handler: (message: { id?: number | string; method?: string; params?: Record<string, unknown> }) => void,
  ): () => void {
    this.notificationListener = handler;
    return () => {
      this.notificationListener = null;
    };
  }

  onServerRequest(
    handler: (message: { id?: number | string; method?: string; params?: Record<string, unknown> }) => void,
  ): () => void {
    this.serverRequestListener = handler;
    return () => {
      this.serverRequestListener = null;
    };
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === 'initialize') return {};
    if (method === 'thread/start') return { thread: { id: 'thr-123' } };
    if (method === 'thread/resume') return { thread: { id: 'thr-123' } };
    if (method === 'turn/start') {
      queueMicrotask(() => {
        this.emit({ method: 'thread/started', params: { thread: { id: 'thr-123' } } });
        this.emit({ method: 'item/agentMessage/delta', params: { itemId: 'msg-1', delta: 'Hello from Codex' } });
        this.emit({
          id: 61,
          method: 'item/permissions/requestApproval',
          params: { reason: 'Need write access' },
        });
        this.emit({
          method: 'turn/completed',
          params: { usage: { input_tokens: 40, cached_input_tokens: 10, output_tokens: 5 } },
        });
      });
      return { turn: { id: 'turn-1' } };
    }
    if (method === 'turn/interrupt') return {};
    return {};
  }

  async notify(): Promise<void> {
    return undefined;
  }

  async respond(id: number | string, result: Record<string, unknown>): Promise<void> {
    this.responses.push({ id, result });
  }
}

function makeContext(): ProviderLaunchContext {
  return {
    taskId: 'task-1',
    sessionId: 'session-1',
    attemptId: 'attempt-1',
    request: {
      taskId: 'task-1',
      sessionId: 'session-1',
      workspaceRoots: ['C:/repo'],
      goal: 'Fix the bug',
      mode: 'edit',
      provider: 'codex',
      verificationProfile: 'default',
    },
    contextPacket: {
      version: 1,
      id: 'ctx-1',
      createdAt: 1,
      task: {
        taskId: 'task-1',
        goal: 'Fix the bug',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'default',
      },
      repoFacts: {
        workspaceRoots: ['C:/repo'],
        roots: [],
        gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 1 },
        diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: 1 },
        recentEdits: { files: [], generatedAt: 1 },
      },
      liveIdeState: { selectedFiles: [], openFiles: [], dirtyFiles: [], dirtyBuffers: [], collectedAt: 1 },
      files: [],
      omittedCandidates: [],
      budget: { estimatedBytes: 0, estimatedTokens: 0, droppedContentNotes: [] },
    },
  };
}

describe('codexAppServerRunner', () => {
  afterEach(() => {
    setCodexAppServerRuntimeForTests(null);
  });

  it('runs a turn, emits streaming content, and resolves approvals through the bridge', async () => {
    const client = new FakeClient();
    const events: ProviderProgressEvent[] = [];
    const sink: ProviderProgressSink = { emit: (event) => void events.push(event) };
    setCodexAppServerRuntimeForTests({
      ensureClient: async () => client,
    });

    const { result } = await runCodexAppServerTurn({
      context: makeContext(),
      cwd: 'C:/repo',
      model: 'gpt-5.4',
      resumeThreadId: undefined,
      sessionRef: createProviderSessionReference('codex', { requestId: 'req-1' }),
      settings: {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'on-request',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      },
      sink,
    });

    const completed = await result;
    expect(completed.threadId).toBe('thr-123');
    expect(completed.usage).toEqual({ inputTokens: 50, outputTokens: 5 });
    expect(events.some((event) => event.status === 'streaming')).toBe(true);
    expect(client.responses).toEqual([{ id: 61, result: { permissions: {}, scope: 'turn' } }]);
  });

  it('interrupts an active turn through turn/interrupt', async () => {
    const client = new FakeClient();
    client.request = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      client.requests.push({ method, params });
      if (method === 'initialize') return {};
      if (method === 'thread/start') return { thread: { id: 'thr-123' } };
      if (method === 'turn/start') return { turn: { id: 'turn-9' } };
      if (method === 'turn/interrupt') return {};
      return {};
    };
    setCodexAppServerRuntimeForTests({
      ensureClient: async () => client,
    });

    const { handle } = await runCodexAppServerTurn({
      context: makeContext(),
      cwd: 'C:/repo',
      model: 'gpt-5.4',
      resumeThreadId: undefined,
      sessionRef: createProviderSessionReference('codex', { requestId: 'req-1' }),
      settings: {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'on-request',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      },
      sink: { emit: () => undefined },
    });

    handle.kill();

    expect(client.requests).toContainEqual({
      method: 'turn/interrupt',
      params: { threadId: 'thr-123', turnId: 'turn-9' },
    });
  });
});
