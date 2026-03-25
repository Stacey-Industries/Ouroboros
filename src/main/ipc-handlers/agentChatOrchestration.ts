/**
 * agentChatOrchestration.ts — Minimal orchestration facade for the chat bridge.
 *
 * Provides only the methods the chat bridge actually uses, delegating directly
 * to provider adapters (Claude Code, Codex). The full AgentLoopController was
 * removed as dead code.
 */

import { formatMemoriesForContext } from '../agentChat/memoryExtractor';
import { sessionMemoryStore } from '../agentChat/sessionMemory';
import log from '../logger';
import { formatGraphSummary } from '../orchestration/graphSummaryBuilder';
import { createClaudeCodeAdapter } from '../orchestration/providers/claudeCodeAdapter';
import { createCodexAdapter } from '../orchestration/providers/codexAdapter';
import type {
  ProviderAdapter,
  ProviderProgressSink,
} from '../orchestration/providers/providerAdapter';
import type {
  ContextPacket,
  OrchestrationProvider,
  ProviderProgressEvent,
  TaskMutationResult,
  TaskRequest,
  TaskSessionRecord,
  TaskSessionResult,
} from '../orchestration/types';
import { getCachedContext } from './agentChatContext';

// ── Provider registry ─────────────────────────────────────────────────

const providerRegistry = new Map<OrchestrationProvider, () => ProviderAdapter>([
  ['claude-code', () => createClaudeCodeAdapter()],
  ['codex', () => createCodexAdapter()],
]);

const adapterCache = new Map<OrchestrationProvider, ProviderAdapter>();

function getAdapter(provider: OrchestrationProvider): ProviderAdapter {
  const cached = adapterCache.get(provider);
  if (cached) return cached;
  const factory = providerRegistry.get(provider);
  if (!factory) throw new Error(`No adapter registered for provider: ${provider}`);
  const adapter = factory();
  adapterCache.set(provider, adapter);
  return adapter;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Context packet helpers ────────────────────────────────────────────

function resolveContextPacket(request: TaskRequest): ContextPacket | undefined {
  const ctx = getCachedContext(request.workspaceRoots);
  log.info('createTask.getCachedContext:', ctx ? 'hit' : 'miss');
  if (!ctx?.cachedPacket) return undefined;
  const packet = ctx.cachedPacket;
  if (!packet.graphSummary) {
    const graphSection = formatGraphSummary(ctx.graphSummary);
    if (graphSection) packet.graphSummary = graphSection;
  }
  return packet;
}

async function injectMemories(
  contextPacket: ContextPacket,
  workspaceRoots: string[],
): Promise<void> {
  if (!contextPacket || workspaceRoots.length === 0) return;
  try {
    const contextFiles = contextPacket.files.map((f) => f.path);
    const memories = await sessionMemoryStore.getRelevantMemories(workspaceRoots[0], contextFiles);
    if (memories.length > 0) {
      contextPacket.sessionMemories = formatMemoriesForContext(memories);
    }
  } catch {
    /* memory loading failure is non-fatal */
  }
}

// ── Task operations ───────────────────────────────────────────────────

interface TaskState {
  sessions: Map<string, TaskSessionRecord>;
  providerListeners: Set<(event: ProviderProgressEvent) => void>;
  sessionListeners: Set<(session: TaskSessionRecord) => void>;
  defaultAdapter: ProviderAdapter;
}

async function createTask(
  request: TaskRequest,
  sessions: Map<string, TaskSessionRecord>,
): Promise<TaskMutationResult> {
  const ct0 = Date.now();
  const taskId = request.taskId ?? createId('task');
  const sessionId = request.sessionId ?? createId('session');

  const contextPacket = resolveContextPacket(request);
  await injectMemories(contextPacket ?? ({} as ContextPacket), request.workspaceRoots);
  if (request.skillExpansion && contextPacket) contextPacket.skillInstructions = request.skillExpansion;

  const session: TaskSessionRecord = {
    version: 1,
    id: sessionId,
    taskId,
    workspaceRoots: request.workspaceRoots,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    request: { ...request, taskId, sessionId },
    status: 'idle',
    attempts: [],
    unresolvedIssues: [],
    contextPacket,
  };
  sessions.set(taskId, session);
  log.info('createTask total:', Date.now() - ct0, 'ms');
  return { success: true, taskId, session, state: { status: 'idle', updatedAt: Date.now() } };
}

async function submitTaskToAdapter(
  session: TaskSessionRecord,
  adapter: ProviderAdapter,
  sink: ProviderProgressSink,
): Promise<{ session: TaskSessionRecord } | { error: string }> {
  try {
    const launched = await adapter.submitTask(
      {
        taskId: session.taskId,
        sessionId: session.id,
        attemptId: createId('attempt'),
        request: session.request,
        contextPacket: session.contextPacket!,
        window: null,
      },
      sink,
    );
    return {
      session: {
        ...session,
        status: 'applying' as const,
        updatedAt: Date.now(),
        providerSession: launched.session,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function startTask(taskId: string, state: TaskState): Promise<TaskMutationResult> {
  const { sessions, providerListeners, sessionListeners, defaultAdapter } = state;
  const session = sessions.get(taskId);
  if (!session) return { success: false, error: `Task ${taskId} not found` };

  const sink: ProviderProgressSink = {
    emit: (event: ProviderProgressEvent) => providerListeners.forEach((l) => l(event)),
  };
  const adapter = providerRegistry.has(session.request.provider)
    ? getAdapter(session.request.provider)
    : defaultAdapter;

  const result = await submitTaskToAdapter(session, adapter, sink);
  if ('error' in result) return { success: false, error: result.error, taskId };

  sessions.set(taskId, result.session);
  sessionListeners.forEach((l) => l(result.session));
  return {
    success: true,
    taskId,
    session: result.session,
    state: { status: 'applying', updatedAt: Date.now() },
  };
}

async function cancelTask(taskId: string, state: TaskState): Promise<TaskMutationResult> {
  const { sessions, providerListeners, sessionListeners, defaultAdapter } = state;
  const session = sessions.get(taskId);
  if (!session) return { success: false, error: `Task ${taskId} not found` };
  if (session.providerSession) {
    const cancelAdapter = providerRegistry.has(session.request.provider)
      ? getAdapter(session.request.provider)
      : defaultAdapter;
    await cancelAdapter.cancelTask(session.providerSession);
  }
  providerListeners.forEach((listener) =>
    listener({
      provider: session.request.provider || 'claude-code',
      status: 'cancelled',
      message: 'Task cancelled by user',
      timestamp: Date.now(),
      session: session.providerSession,
    }),
  );
  const cancelled = { ...session, status: 'cancelled' as const, updatedAt: Date.now() };
  sessions.set(taskId, cancelled);
  sessionListeners.forEach((l) => l(cancelled));
  return {
    success: true,
    taskId,
    session: cancelled,
    state: { status: 'cancelled', updatedAt: Date.now() },
  };
}

// ── Factory ───────────────────────────────────────────────────────────

export type MinimalOrchestration = ReturnType<typeof createMinimalOrchestration>;

export function createMinimalOrchestration() {
  const taskState: TaskState = {
    defaultAdapter: getAdapter('claude-code'),
    sessions: new Map<string, TaskSessionRecord>(),
    providerListeners: new Set<(event: ProviderProgressEvent) => void>(),
    sessionListeners: new Set<(session: TaskSessionRecord) => void>(),
  };

  return {
    createTask: (request: TaskRequest) => createTask(request, taskState.sessions),
    startTask: (taskId: string) => startTask(taskId, taskState),
    cancelTask: (taskId: string) => cancelTask(taskId, taskState),

    async loadSession(sessionId: string): Promise<TaskSessionResult> {
      for (const session of taskState.sessions.values()) {
        if (session.id === sessionId) return { success: true, session };
      }
      return { success: false, error: `Session ${sessionId} not found` };
    },

    onProviderEvent(callback: (event: ProviderProgressEvent) => void): () => void {
      taskState.providerListeners.add(callback);
      return () => taskState.providerListeners.delete(callback);
    },

    onSessionUpdate(callback: (session: TaskSessionRecord) => void): () => void {
      taskState.sessionListeners.add(callback);
      return () => taskState.sessionListeners.delete(callback);
    },
  };
}
