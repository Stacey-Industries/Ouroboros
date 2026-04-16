import type { OrchestrationAPI } from '../orchestration/types';
import {
  type AgentChatOrchestrationBridge,
  type AgentChatOrchestrationBridgeDeps,
  createAgentChatOrchestrationBridge,
} from './chatOrchestrationBridge';
import { hydrateLatestAgentChatThread } from './threadHydrator';
import { type AgentChatThreadStore, agentChatThreadStore } from './threadStore';
import type {
  AgentChatAPI,
  AgentChatCreateThreadRequest,
  AgentChatDeleteResult,
  AgentChatRevertResult,
  AgentChatSendMessageRequest,
  AgentChatStreamChunk,
  AgentChatThreadRecord,
  AgentChatThreadResult,
  AgentChatThreadsResult,
} from './types';
import { getErrorMessage, isNonEmptyString } from './utils';

export * from './chatOrchestrationBridge';
export * from './eventProjector';
export * from './events';
export * from './memoryExtractor';
export * from './sessionMemory';
export * from './settingsResolver';
export * from './threadHydrator';
export * from './threadStore';
export * from './types';

export interface AgentChatService extends Pick<
  AgentChatAPI,
  | 'createThread'
  | 'deleteThread'
  | 'loadThread'
  | 'listThreads'
  | 'sendMessage'
  | 'resumeLatestThread'
  | 'getLinkedDetails'
  | 'branchThread'
  | 'reRunFromMessage'
> {
  bridge: AgentChatOrchestrationBridge;
  threadStore: AgentChatThreadStore;
  /** Returns buffered stream chunks for reconnection after renderer refresh. */
  getBufferedChunks: (threadId: string) => AgentChatStreamChunk[];
  /** Revert file changes made during a specific assistant message's agent turn. */
  revertToSnapshot: (threadId: string, messageId: string) => Promise<AgentChatRevertResult>;
}

export interface AgentChatServiceDeps extends Omit<
  AgentChatOrchestrationBridgeDeps,
  'threadStore'
> {
  threadStore?: AgentChatThreadStore;
}

async function createThreadResult(
  threadStore: AgentChatThreadStore,
  request: AgentChatCreateThreadRequest,
): Promise<AgentChatThreadResult> {
  try {
    return { success: true, thread: await threadStore.createThread(request) };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function loadThreadResult(
  threadStore: AgentChatThreadStore,
  threadId: string,
): Promise<AgentChatThreadResult> {
  const thread = await threadStore.loadThread(threadId);
  return thread
    ? { success: true, thread }
    : { success: false, error: `Chat thread ${threadId} not found.` };
}

async function reconcileThreadStatus(
  thread: AgentChatThreadRecord,
  activeThreadIds: Set<string>,
  threadStore: AgentChatThreadStore,
): Promise<AgentChatThreadRecord> {
  if (thread.status !== 'running' && thread.status !== 'submitting') return thread;
  if (activeThreadIds.has(thread.id)) return thread;
  // Thread claims to be running but the bridge has no active send — stale status
  // from a refresh/crash. Reset to 'idle' so the user can chat again.
  try {
    return await threadStore.updateThread(thread.id, { status: 'idle' });
  } catch {
    return { ...thread, status: 'idle' };
  }
}

async function listThreadsResult(
  threadStore: AgentChatThreadStore,
  workspaceRoot?: string,
  bridge?: AgentChatOrchestrationBridge,
): Promise<AgentChatThreadsResult> {
  try {
    const threads = await threadStore.listThreads(workspaceRoot);
    if (bridge) {
      const activeIds = new Set(bridge.getActiveThreadIds());
      const reconciled = await Promise.all(
        threads.map((t) => reconcileThreadStatus(t, activeIds, threadStore)),
      );
      return { success: true, threads: reconciled };
    }
    return { success: true, threads };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function resumeLatestThreadResult(
  threadStore: AgentChatThreadStore,
  orchestration: Pick<OrchestrationAPI, 'loadSession'>,
  workspaceRoot: string,
  bridge?: AgentChatOrchestrationBridge,
): Promise<AgentChatThreadResult> {
  if (!isNonEmptyString(workspaceRoot)) {
    return {
      success: false,
      error: 'Workspace root is required to resume the latest chat thread.',
    };
  }

  try {
    let thread = await hydrateLatestAgentChatThread({
      orchestration,
      threadStore,
      workspaceRoot,
    });
    if (thread && bridge) {
      const activeIds = new Set(bridge.getActiveThreadIds());
      thread = await reconcileThreadStatus(thread, activeIds, threadStore);
    }
    return {
      success: true,
      thread: thread ?? undefined,
    };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function deleteThreadResult(
  threadStore: AgentChatThreadStore,
  threadId: string,
): Promise<AgentChatDeleteResult> {
  try {
    const deleted = await threadStore.deleteThread(threadId);
    return deleted
      ? { success: true, threadId }
      : { success: false, error: `Chat thread ${threadId} not found.` };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function branchThreadResult(
  threadStore: AgentChatThreadStore,
  threadId: string,
  fromMessageId: string,
): Promise<AgentChatThreadResult> {
  try {
    const thread = await threadStore.branchThread(threadId, fromMessageId);
    return { success: true, thread };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

type RerunOverrides = { model?: string; effort?: string; permissionMode?: string };

function buildRerunSendOverrides(overrides?: RerunOverrides): Record<string, string> | undefined {
  if (!overrides) return undefined;
  const out: Record<string, string> = {};
  if (overrides.model) out.model = overrides.model;
  if (overrides.effort) out.effort = overrides.effort;
  if (overrides.permissionMode) out.permissionMode = overrides.permissionMode;
  return Object.keys(out).length > 0 ? out : undefined;
}

async function reRunFromMessageResult(args: {
  threadStore: AgentChatThreadStore;
  bridge: AgentChatOrchestrationBridge;
  threadId: string;
  messageId: string;
  overrides?: RerunOverrides;
}): Promise<AgentChatThreadResult> {
  try {
    const { branch, userMessage } = await args.threadStore.reRunFromMessage(
      args.threadId, args.messageId,
    );
    const request: AgentChatSendMessageRequest = {
      threadId: branch.id,
      workspaceRoot: branch.workspaceRoot,
      content: userMessage.content,
      overrides: buildRerunSendOverrides(args.overrides),
      metadata: { source: 'retry' },
    };
    const sendResult = await args.bridge.sendMessage(request);
    if (!sendResult.success) return { success: false, error: sendResult.error };
    return { success: true, thread: sendResult.thread ?? branch };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export function createAgentChatService(deps: AgentChatServiceDeps): AgentChatService {
  const threadStore = deps.threadStore ?? agentChatThreadStore;
  const bridge = createAgentChatOrchestrationBridge({
    orchestration: deps.orchestration,
    threadStore,
    createId: deps.createId,
    getSettings: deps.getSettings,
    now: deps.now,
  });

  return {
    bridge,
    threadStore,
    createThread: (request) => createThreadResult(threadStore, request),
    deleteThread: (threadId) => deleteThreadResult(threadStore, threadId),
    loadThread: (threadId) => loadThreadResult(threadStore, threadId),
    listThreads: (workspaceRoot?) => listThreadsResult(threadStore, workspaceRoot, bridge),
    sendMessage: (request) => bridge.sendMessage(request),
    resumeLatestThread: (root) =>
      resumeLatestThreadResult(threadStore, deps.orchestration, root, bridge),
    getBufferedChunks: (threadId) => bridge.getBufferedChunks(threadId),
    revertToSnapshot: (threadId, messageId) => bridge.revertToSnapshot(threadId, messageId),
    getLinkedDetails: (link) => bridge.getLinkedDetails(link),
    branchThread: (threadId, fromMessageId) =>
      branchThreadResult(threadStore, threadId, fromMessageId),
    reRunFromMessage: (threadId, messageId, overrides) =>
      reRunFromMessageResult({ threadStore, bridge, threadId, messageId, overrides }),
  };
}

export function createAgentChatServiceFromOrchestration(
  orchestration: Pick<
    OrchestrationAPI,
    'createTask' | 'startTask' | 'loadSession' | 'onProviderEvent' | 'onSessionUpdate'
  >,
): AgentChatService {
  return createAgentChatService({ orchestration });
}
