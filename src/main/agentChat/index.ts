import type { OrchestrationAPI } from '../orchestration/types'
import {
  createAgentChatOrchestrationBridge,
  type AgentChatOrchestrationBridge,
  type AgentChatOrchestrationBridgeDeps,
} from './chatOrchestrationBridge'
import {
  agentChatThreadStore,
  type AgentChatThreadStore,
} from './threadStore'
import { hydrateLatestAgentChatThread } from './threadHydrator'
import type {
  AgentChatAPI,
  AgentChatCreateThreadRequest,
  AgentChatDeleteResult,
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatSendMessageRequest,
  AgentChatSendResult,
  AgentChatThreadResult,
  AgentChatThreadsResult,
} from './types'

export * from './events'
export * from './types'
export * from './threadStore'
export * from './chatOrchestrationBridge'
export * from './eventProjector'
export * from './settingsResolver'
export * from './threadHydrator'

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
}

export interface AgentChatServiceDeps
  extends Omit<AgentChatOrchestrationBridgeDeps, 'threadStore'> {
  threadStore?: AgentChatThreadStore
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

async function listThreadsResult(
  threadStore: AgentChatThreadStore,
  workspaceRoot?: string,
): Promise<AgentChatThreadsResult> {
  try {
    return { success: true, threads: await threadStore.listThreads(workspaceRoot) }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function resumeLatestThreadResult(
  threadStore: AgentChatThreadStore,
  orchestration: Pick<OrchestrationAPI, 'loadSession'>,
  workspaceRoot: string,
): Promise<AgentChatThreadResult> {
  if (!isNonEmptyString(workspaceRoot)) {
    return { success: false, error: 'Workspace root is required to resume the latest chat thread.' }
  }

  try {
    const thread = await hydrateLatestAgentChatThread({
      orchestration,
      threadStore,
      workspaceRoot,
    })
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
      return listThreadsResult(threadStore, workspaceRoot)
    },
    sendMessage(request: AgentChatSendMessageRequest): Promise<AgentChatSendResult> {
      return bridge.sendMessage(request)
    },
    resumeLatestThread(workspaceRoot: string): Promise<AgentChatThreadResult> {
      return resumeLatestThreadResult(threadStore, deps.orchestration, workspaceRoot)
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
