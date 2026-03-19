import type { OrchestrationAPI } from '../orchestration/types'
import {
  type AgentChatOrchestrationBridge,
  type AgentChatOrchestrationBridgeDeps,
  createAgentChatOrchestrationBridge,
} from './chatOrchestrationBridge'
import { hydrateLatestAgentChatThread } from './threadHydrator'
import {
  type AgentChatThreadStore,
  agentChatThreadStore,
} from './threadStore'
import type {
  AgentChatAPI,
  AgentChatCreateThreadRequest,
  AgentChatDeleteResult,
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatRevertResult,
  AgentChatSendMessageRequest,
  AgentChatSendResult,
  AgentChatStreamChunk,
  AgentChatThreadRecord,
  AgentChatThreadResult,
  AgentChatThreadsResult,
} from './types'
import { getErrorMessage, isNonEmptyString } from './utils'

export * from './chatOrchestrationBridge'
export * from './eventProjector'
export * from './events'
export * from './settingsResolver'
export * from './threadHydrator'
export * from './threadStore'
export * from './types'

export interface AgentChatService extends Pick<AgentChatAPI,
  'createThread'
  | 'deleteThread'
  | 'loadThread'
  | 'listThreads'
  | 'sendMessage'
  | 'resumeLatestThread'
  | 'getLinkedDetails'
  | 'branchThread'> {
  bridge: AgentChatOrchestrationBridge
  threadStore: AgentChatThreadStore
  /** Returns buffered stream chunks for reconnection after renderer refresh. */
  getBufferedChunks: (threadId: string) => AgentChatStreamChunk[]
  /** Revert file changes made during a specific assistant message's agent turn. */
  revertToSnapshot: (threadId: string, messageId: string) => Promise<AgentChatRevertResult>
}

export interface AgentChatServiceDeps
  extends Omit<AgentChatOrchestrationBridgeDeps, 'threadStore'> {
  threadStore?: AgentChatThreadStore
}

async function createThreadResult(
  threadStore: AgentChatThreadStore,
  request: AgentChatCreateThreadRequest,
): Promise<AgentChatThreadResult> {
  try {
    return { success: true, thread: await threadStore.createThread(request) }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function loadThreadResult(
  threadStore: AgentChatThreadStore,
  threadId: string,
): Promise<AgentChatThreadResult> {
  const thread = await threadStore.loadThread(threadId)
  return thread
    ? { success: true, thread }
    : { success: false, error: `Chat thread ${threadId} not found.` }
}

async function reconcileThreadStatus(
  thread: AgentChatThreadRecord,
  activeThreadIds: Set<string>,
  threadStore: AgentChatThreadStore,
): Promise<AgentChatThreadRecord> {
  if (thread.status !== 'running' && thread.status !== 'submitting') return thread
  if (activeThreadIds.has(thread.id)) return thread
  // Thread claims to be running but the bridge has no active send — stale status
  // from a refresh/crash. Reset to 'idle' so the user can chat again.
  try {
    return await threadStore.updateThread(thread.id, { status: 'idle' })
  } catch {
    return { ...thread, status: 'idle' }
  }
}

async function listThreadsResult(
  threadStore: AgentChatThreadStore,
  workspaceRoot?: string,
  bridge?: AgentChatOrchestrationBridge,
): Promise<AgentChatThreadsResult> {
  try {
    const threads = await threadStore.listThreads(workspaceRoot)
    if (bridge) {
      const activeIds = new Set(bridge.getActiveThreadIds())
      const reconciled = await Promise.all(
        threads.map((t) => reconcileThreadStatus(t, activeIds, threadStore)),
      )
      return { success: true, threads: reconciled }
    }
    return { success: true, threads }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function resumeLatestThreadResult(
  threadStore: AgentChatThreadStore,
  orchestration: Pick<OrchestrationAPI, 'loadSession'>,
  workspaceRoot: string,
  bridge?: AgentChatOrchestrationBridge,
): Promise<AgentChatThreadResult> {
  if (!isNonEmptyString(workspaceRoot)) {
    return { success: false, error: 'Workspace root is required to resume the latest chat thread.' }
  }

  try {
    let thread = await hydrateLatestAgentChatThread({
      orchestration,
      threadStore,
      workspaceRoot,
    })
    if (thread && bridge) {
      const activeIds = new Set(bridge.getActiveThreadIds())
      thread = await reconcileThreadStatus(thread, activeIds, threadStore)
    }
    return {
      success: true,
      thread: thread ?? undefined,
    }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

export function createAgentChatService(
  deps: AgentChatServiceDeps,
): AgentChatService {
  const threadStore = deps.threadStore ?? agentChatThreadStore
  const bridge = createAgentChatOrchestrationBridge({
    orchestration: deps.orchestration,
    threadStore,
    createId: deps.createId,
    getSettings: deps.getSettings,
    now: deps.now,
  })

  return {
    bridge,
    threadStore,
    createThread(request: AgentChatCreateThreadRequest): Promise<AgentChatThreadResult> {
      return createThreadResult(threadStore, request)
    },
    async deleteThread(threadId: string): Promise<AgentChatDeleteResult> {
      try {
        const deleted = await threadStore.deleteThread(threadId)
        return deleted
          ? { success: true, threadId }
          : { success: false, error: `Chat thread ${threadId} not found.` }
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    },
    loadThread(threadId: string): Promise<AgentChatThreadResult> {
      return loadThreadResult(threadStore, threadId)
    },
    listThreads(workspaceRoot?: string): Promise<AgentChatThreadsResult> {
      return listThreadsResult(threadStore, workspaceRoot, bridge)
    },
    sendMessage(request: AgentChatSendMessageRequest): Promise<AgentChatSendResult> {
      return bridge.sendMessage(request)
    },
    resumeLatestThread(workspaceRoot: string): Promise<AgentChatThreadResult> {
      return resumeLatestThreadResult(threadStore, deps.orchestration, workspaceRoot, bridge)
    },
    getBufferedChunks(threadId: string): AgentChatStreamChunk[] {
      return bridge.getBufferedChunks(threadId)
    },
    revertToSnapshot(threadId: string, messageId: string): Promise<AgentChatRevertResult> {
      return bridge.revertToSnapshot(threadId, messageId)
    },
    getLinkedDetails(link: AgentChatOrchestrationLink): Promise<AgentChatLinkedDetailsResult> {
      return bridge.getLinkedDetails(link)
    },
    async branchThread(threadId: string, fromMessageId: string): Promise<AgentChatThreadResult> {
      try {
        const thread = await threadStore.branchThread(threadId, fromMessageId)
        return { success: true, thread }
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    },
  }
}

export function createAgentChatServiceFromOrchestration(
  orchestration: Pick<OrchestrationAPI, 'createTask' | 'startTask' | 'loadSession' | 'onProviderEvent' | 'onSessionUpdate'>,
): AgentChatService {
  return createAgentChatService({ orchestration })
}
