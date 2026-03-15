import { randomUUID } from 'crypto'
import { getConfigValue } from '../config'
import type { OrchestrationAPI, ProviderProgressEvent } from '../orchestration/types'
import { resolveAgentChatSettings } from './settingsResolver'
import {
  projectProviderResultToAssistantMessage,
  projectProviderFailureToAssistantMessage,
} from './responseProjector'
import { agentChatThreadStore, type AgentChatThreadStore } from './threadStore'
import {
  buildAgentChatOrchestrationLink,
  buildAssistantMessageId,
  buildSendFailureResult,
  buildSendSuccessResult,
  buildThreadWithAssistantMessage,
  createOrchestrationFailure,
  mapOrchestrationStatusToAgentChatStatus,
  persistThreadLinkage,
} from './chatOrchestrationBridgeSupport'
import {
  preparePendingSend,
  resolveSendOptions,
  type PreparedSend,
  validateSendRequest,
} from './chatOrchestrationRequestSupport'
import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatSendMessageRequest,
  AgentChatSendResult,
  AgentChatSettings,
  AgentChatStreamChunk,
} from './types'

export type StreamChunkListener = (chunk: AgentChatStreamChunk) => void

export interface AgentChatOrchestrationBridgeDeps {
  orchestration: Pick<OrchestrationAPI, 'createTask' | 'startTask' | 'loadSession' | 'onProviderEvent' | 'onSessionUpdate'>
  threadStore?: AgentChatThreadStore
  createId?: () => string
  getSettings?: () => AgentChatSettings
  now?: () => number
}

export interface AgentChatOrchestrationBridge {
  sendMessage: (request: AgentChatSendMessageRequest) => Promise<AgentChatSendResult>
  getLinkedDetails: (link: AgentChatOrchestrationLink) => Promise<AgentChatLinkedDetailsResult>
  onStreamChunk: (listener: StreamChunkListener) => () => void
  dispose: () => void
}

type OrchestrationClient = AgentChatOrchestrationBridgeDeps['orchestration']
type CreateTaskResult = Awaited<ReturnType<OrchestrationClient['createTask']>>
type StartTaskResult = Awaited<ReturnType<OrchestrationClient['startTask']>>

interface AgentChatBridgeRuntime {
  createId: () => string
  getSettings: () => AgentChatSettings
  now: () => number
  orchestration: OrchestrationClient
  threadStore: AgentChatThreadStore
  streamChunkListeners: Set<StreamChunkListener>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function failPendingSend(args: {
  error: string
  link?: AgentChatOrchestrationLink
  messageId?: string
  thread?: PreparedSend['thread']
  threadStore: AgentChatThreadStore
}): Promise<AgentChatSendResult> {
  if (!args.thread || !args.messageId) {
    return buildSendFailureResult({ error: args.error, orchestration: args.link })
  }

  const thread = await persistThreadLinkage({
    error: createOrchestrationFailure(args.error),
    link: args.link,
    messageId: args.messageId,
    status: 'failed',
    thread: args.thread,
    threadStore: args.threadStore,
  })

  return buildSendFailureResult({
    error: args.error,
    messageId: args.messageId,
    orchestration: args.link,
    thread,
  })
}

async function persistCreatedLink(args: {
  created: CreateTaskResult
  pending: PreparedSend
  threadStore: AgentChatThreadStore
}): Promise<{ link: AgentChatOrchestrationLink; thread: PreparedSend['thread'] }> {
  const link = buildAgentChatOrchestrationLink(args.created.session) ?? {
    taskId: args.created.taskId,
    sessionId: args.created.session?.id,
  }

  const thread = await persistThreadLinkage({
    link,
    messageId: args.pending.messageId,
    status: 'submitting',
    thread: args.pending.thread,
    threadStore: args.threadStore,
  })

  return { link, thread }
}

async function finalizeStartedTask(args: {
  fallbackLink: AgentChatOrchestrationLink
  linkedThread: PreparedSend['thread']
  pending: PreparedSend
  started: StartTaskResult
  threadStore: AgentChatThreadStore
}): Promise<AgentChatSendResult> {
  if (!args.started.success || !args.started.session) {
    const failedLink = buildAgentChatOrchestrationLink(args.started.session) ?? args.fallbackLink
    return failPendingSend({
      error: args.started.error ?? 'Failed to start the orchestration task.',
      link: failedLink,
      messageId: args.pending.messageId,
      thread: args.linkedThread,
      threadStore: args.threadStore,
    })
  }

  const startedLink = buildAgentChatOrchestrationLink(args.started.session) ?? args.fallbackLink
  const thread = await persistThreadLinkage({
    link: startedLink,
    messageId: args.pending.messageId,
    status: mapOrchestrationStatusToAgentChatStatus(args.started.session.status),
    thread: args.linkedThread,
    threadStore: args.threadStore,
  })

  return buildSendSuccessResult({
    messageId: args.pending.messageId,
    orchestration: startedLink,
    thread,
  })
}

/**
 * Tracks active streaming sends so that provider event and session update
 * subscriptions can forward progress into the chat stream channel.
 */
interface ActiveStreamContext {
  threadId: string
  assistantMessageId: string
  taskId: string
  sessionId: string
  link: AgentChatOrchestrationLink
  accumulatedText: string
  firstChunkEmitted: boolean
}

const activeSends = new Map<string, ActiveStreamContext>()

function emitStreamChunk(
  listeners: Set<StreamChunkListener>,
  chunk: AgentChatStreamChunk,
): void {
  for (const listener of listeners) {
    try {
      listener(chunk)
    } catch {
      // swallow listener errors
    }
  }
}

function handleProviderProgress(
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
): void {
  // Find matching active send by session reference.
  // Three fallback strategies: sessionId match, externalTaskId match, or
  // requestId containing the task ID (set by the adapter as "orchestration-{taskId}").
  let ctx: ActiveStreamContext | undefined
  for (const [, entry] of activeSends) {
    if (
      progress.session?.sessionId === entry.sessionId ||
      progress.session?.externalTaskId === entry.taskId ||
      progress.session?.requestId?.includes(entry.taskId)
    ) {
      ctx = entry
      break
    }
  }
  if (!ctx) return

  const now = runtime.now()

  if (progress.status === 'streaming') {
    if (progress.message?.startsWith('__tool__:')) {
      // Parse tool activity signal from the adapter
      try {
        const toolJson = JSON.parse(progress.message.slice('__tool__:'.length)) as {
          name: string
          status: 'running' | 'complete'
        }
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId: ctx.threadId,
          messageId: ctx.assistantMessageId,
          type: 'tool_activity',
          toolActivity: { name: toolJson.name, status: toolJson.status },
          timestamp: now,
        })
      } catch {
        // Malformed tool JSON — ignore
      }
    } else if (progress.message) {
      ctx.accumulatedText += progress.message
      emitStreamChunk(runtime.streamChunkListeners, {
        threadId: ctx.threadId,
        messageId: ctx.assistantMessageId,
        type: 'text_delta',
        textDelta: progress.message,
        timestamp: now,
      })
    }
    ctx.firstChunkEmitted = true
  } else if (progress.status === 'completed') {
    // Finalize: build the assistant message from accumulated text.
    // Use upsert semantics: the session-update projector may have already
    // written a placeholder with the same deterministic ID (it runs before
    // providerListeners fire). If so, update it with the real streaming text;
    // otherwise append fresh.
    const assistantMessage = projectProviderResultToAssistantMessage({
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      responseText: ctx.accumulatedText,
      orchestrationLink: ctx.link,
      timestamp: now,
    })

    void (async () => {
      try {
        const thread = await runtime.threadStore.loadThread(ctx!.threadId)
        const exists = thread?.messages.some((m) => m.id === ctx!.assistantMessageId)
        let updatedThread: import('./types').AgentChatThreadRecord
        if (exists) {
          updatedThread = await runtime.threadStore.updateMessage(ctx!.threadId, ctx!.assistantMessageId, {
            content: assistantMessage.content,
            orchestration: assistantMessage.orchestration,
            toolsSummary: assistantMessage.toolsSummary,
            costSummary: assistantMessage.costSummary,
            durationSummary: assistantMessage.durationSummary,
          })
        } else {
          updatedThread = await runtime.threadStore.appendMessage(ctx!.threadId, assistantMessage)
        }
        await runtime.threadStore.updateThread(updatedThread.id, {
          status: 'complete',
          latestOrchestration: ctx!.link,
        })
      } catch { /* swallow persistence errors */ }
    })()

    emitStreamChunk(runtime.streamChunkListeners, {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'complete',
      timestamp: now,
    })
    activeSends.delete(ctx.taskId)
  } else if (progress.status === 'cancelled') {
    emitStreamChunk(runtime.streamChunkListeners, {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'error',
      textDelta: 'Cancelled.',
      timestamp: now,
    })
    activeSends.delete(ctx.taskId)
  } else if (progress.status === 'failed') {
    const failureMessage = projectProviderFailureToAssistantMessage({
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      errorMessage: progress.message || 'Provider task failed.',
      orchestrationLink: ctx.link,
      timestamp: now,
    })

    void runtime.threadStore.appendMessage(ctx.threadId, failureMessage).then((thread) => {
      return runtime.threadStore.updateThread(thread.id, {
        status: 'failed',
        latestOrchestration: ctx!.link,
      })
    }).catch(() => { /* swallow persistence errors */ })

    emitStreamChunk(runtime.streamChunkListeners, {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'error',
      textDelta: progress.message,
      timestamp: now,
    })
    activeSends.delete(ctx.taskId)
  }
}

async function executePendingSend(args: {
  orchestration: OrchestrationClient
  pending: PreparedSend
  runtime: AgentChatBridgeRuntime
  threadStore: AgentChatThreadStore
}): Promise<AgentChatSendResult> {
  const created = await args.orchestration.createTask(args.pending.taskRequest)
  if (!created.success || !created.taskId || !created.session) {
    return failPendingSend({
      error: created.error ?? 'Failed to create the orchestration task.',
      messageId: args.pending.messageId,
      thread: args.pending.thread,
      threadStore: args.threadStore,
    })
  }

  const linked = await persistCreatedLink({
    created,
    pending: args.pending,
    threadStore: args.threadStore,
  })

  // Register active streaming context before starting the task
  const assistantMessageId = buildAssistantMessageId(args.runtime.createId, created.session.id)
  const streamCtx: ActiveStreamContext = {
    threadId: args.pending.thread.id,
    assistantMessageId,
    taskId: created.taskId,
    sessionId: created.session.id,
    link: linked.link,
    accumulatedText: '',
    firstChunkEmitted: false,
  }
  activeSends.set(created.taskId, streamCtx)

  const started = await args.orchestration.startTask(created.taskId)
  return finalizeStartedTask({
    fallbackLink: linked.link,
    linkedThread: linked.thread,
    pending: args.pending,
    started,
    threadStore: args.threadStore,
  })
}

async function sendMessageWithBridge(
  runtime: AgentChatBridgeRuntime,
  request: AgentChatSendMessageRequest,
): Promise<AgentChatSendResult> {
  const validationError = validateSendRequest(request)
  if (validationError) return buildSendFailureResult({ error: validationError })

  try {
    const pending = await preparePendingSend({
      content: request.content.trim(),
      createId: runtime.createId,
      now: runtime.now,
      request,
      resolved: resolveSendOptions(runtime.getSettings(), request),
      threadStore: runtime.threadStore,
    })

    return executePendingSend({
      orchestration: runtime.orchestration,
      pending,
      runtime,
      threadStore: runtime.threadStore,
    })
  } catch (error) {
    return buildSendFailureResult({ error: getErrorMessage(error) })
  }
}

async function getLinkedDetailsWithBridge(
  orchestration: OrchestrationClient,
  link: AgentChatOrchestrationLink,
): Promise<AgentChatLinkedDetailsResult> {
  if (!link.sessionId) {
    return {
      success: false,
      error: 'The linked orchestration session is unavailable for this chat item.',
      link,
    }
  }

  const sessionResult = await orchestration.loadSession(link.sessionId)
  if (!sessionResult.success || !sessionResult.session) {
    return {
      success: false,
      error: sessionResult.error ?? `Orchestration session ${link.sessionId} was not found.`,
      link,
    }
  }

  return {
    success: true,
    link: buildAgentChatOrchestrationLink(sessionResult.session) ?? link,
    session: sessionResult.session,
    result: sessionResult.session.latestResult,
  }
}

export function createAgentChatOrchestrationBridge(
  deps: AgentChatOrchestrationBridgeDeps,
): AgentChatOrchestrationBridge {
  const streamChunkListeners = new Set<StreamChunkListener>()
  const runtime: AgentChatBridgeRuntime = {
    createId: deps.createId ?? randomUUID,
    getSettings: deps.getSettings ?? (() => resolveAgentChatSettings({
      agentChatSettings: getConfigValue('agentChatSettings'),
      claudeCliSettings: getConfigValue('claudeCliSettings'),
    })),
    now: deps.now ?? Date.now,
    orchestration: deps.orchestration,
    threadStore: deps.threadStore ?? agentChatThreadStore,
    streamChunkListeners,
  }

  // Subscribe to orchestration provider events to forward streaming progress
  const unsubProviderEvent = deps.orchestration.onProviderEvent((event) => {
    handleProviderProgress(runtime, event)
  })

  return {
    sendMessage: (request) => sendMessageWithBridge(runtime, request),
    getLinkedDetails: (link) => getLinkedDetailsWithBridge(runtime.orchestration, link),
    onStreamChunk: (listener: StreamChunkListener) => {
      streamChunkListeners.add(listener)
      return () => streamChunkListeners.delete(listener)
    },
    dispose: () => {
      unsubProviderEvent()
      streamChunkListeners.clear()
      activeSends.clear()
    },
  }
}
