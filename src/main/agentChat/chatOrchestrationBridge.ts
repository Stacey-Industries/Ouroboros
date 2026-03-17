import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { getConfigValue } from '../config'
import type { OrchestrationAPI, ProviderProgressEvent } from '../orchestration/types'
import { resolveAgentChatSettings, type ResolvedAgentChatSettings } from './settingsResolver'
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
  deriveSmartTitle,
  generateLlmTitle,
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
  getSettings?: () => ResolvedAgentChatSettings
  now?: () => number
}

export interface AgentChatOrchestrationBridge {
  sendMessage: (request: AgentChatSendMessageRequest) => Promise<AgentChatSendResult>
  getLinkedDetails: (link: AgentChatOrchestrationLink) => Promise<AgentChatLinkedDetailsResult>
  onStreamChunk: (listener: StreamChunkListener) => () => void
  /** Returns thread IDs that have an active in-flight send (truly running). */
  getActiveThreadIds: () => string[]
  /** Returns buffered stream chunks for a thread (for reconnection after refresh). */
  getBufferedChunks: (threadId: string) => AgentChatStreamChunk[]
  /** Revert file changes made during a specific assistant message's agent turn. */
  revertToSnapshot: (threadId: string, messageId: string) => Promise<import('./types').AgentChatRevertResult>
  dispose: () => void
}

type OrchestrationClient = AgentChatOrchestrationBridgeDeps['orchestration']
type CreateTaskResult = Awaited<ReturnType<OrchestrationClient['createTask']>>
type StartTaskResult = Awaited<ReturnType<OrchestrationClient['startTask']>>

interface AgentChatBridgeRuntime {
  createId: () => string
  getSettings: () => ResolvedAgentChatSettings
  now: () => number
  orchestration: OrchestrationClient
  threadStore: AgentChatThreadStore
  streamChunkListeners: Set<StreamChunkListener>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Capture current git HEAD hash for the given project root (for revert support). */
function captureHeadHash(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5000 }, (err, stdout) => {
      resolve(err ? undefined : stdout.trim() || undefined)
    })
  })
}

function gitExecSimple(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 10000 }, (err, stdout) => {
      err ? reject(err) : resolve(stdout)
    })
  })
}

/**
 * Revert all file changes made since the given snapshot hash.
 *
 * Strategy: parse `git diff --name-status <hash>` to find exactly which files
 * the agent touched, then:
 *   - Modified/Deleted (M/D): restore via `git checkout <hash> -- <file>`
 *   - Added (A): remove with `fs.unlink` (file didn't exist at snapshot)
 *   - Renamed (R): restore old path, remove new path
 *
 * This scopes the revert to only what changed — it won't touch untracked
 * files that existed before the agent ran.
 */
async function executeGitRevert(workspaceRoot: string, snapshotHash: string): Promise<{
  revertedFiles: string[]
}> {
  // 1. Get the list of files changed since the snapshot with their status
  const diffOutput = await gitExecSimple(
    ['diff', '--name-status', snapshotHash],
    workspaceRoot,
  )

  if (!diffOutput.trim()) {
    return { revertedFiles: [] }
  }

  const lines = diffOutput.trim().split('\n')
  const filesToRestore: string[] = []  // M, D — restore from snapshot
  const filesToRemove: string[] = []   // A — delete (didn't exist at snapshot)

  for (const line of lines) {
    // Format: "M\tpath" or "R100\told\tnew"
    const parts = line.split('\t')
    const status = parts[0]
    const filePath = parts[1]

    if (status === 'A') {
      filesToRemove.push(filePath)
    } else if (status === 'M' || status === 'D') {
      filesToRestore.push(filePath)
    } else if (status.startsWith('R')) {
      // Renamed: restore old path from snapshot, remove new path
      const newPath = parts[2]
      filesToRestore.push(filePath)  // old name — restore it
      if (newPath) filesToRemove.push(newPath)  // new name — remove it
    }
  }

  // 2. Restore modified/deleted files in batches (avoid arg length limits)
  const BATCH_SIZE = 50
  for (let i = 0; i < filesToRestore.length; i += BATCH_SIZE) {
    const batch = filesToRestore.slice(i, i + BATCH_SIZE)
    await gitExecSimple(['checkout', snapshotHash, '--', ...batch], workspaceRoot)
  }

  // 3. Remove agent-created files
  const removeResults = await Promise.allSettled(
    filesToRemove.map((f) => unlink(join(workspaceRoot, f))),
  )
  // Log failures but don't throw — partial revert is better than no revert
  for (let i = 0; i < removeResults.length; i++) {
    if (removeResults[i].status === 'rejected') {
      console.warn(`[agentChat] revert: failed to remove added file ${filesToRemove[i]}`)
    }
  }

  return { revertedFiles: [...filesToRestore, ...filesToRemove] }
}

async function revertToSnapshotWithBridge(
  threadStore: AgentChatThreadStore,
  threadId: string,
  messageId: string,
): Promise<import('./types').AgentChatRevertResult> {
  const thread = await threadStore.loadThread(threadId)
  if (!thread) {
    return { success: false, error: 'Thread not found.' }
  }

  // Find the assistant message and its pre-snapshot hash
  const message = thread.messages.find((m) => m.id === messageId)
  if (!message) {
    return { success: false, error: 'Message not found.' }
  }

  const snapshotHash = message.orchestration?.preSnapshotHash
  if (!snapshotHash) {
    return { success: false, error: 'No snapshot was captured before this agent turn. Revert is unavailable.' }
  }

  // Don't revert if a task is currently running on this thread
  for (const [, ctx] of activeSends) {
    if (ctx.threadId === threadId) {
      return { success: false, error: 'Cannot revert while the agent is still working.' }
    }
  }

  try {
    const { revertedFiles } = await executeGitRevert(thread.workspaceRoot, snapshotHash)
    return {
      success: true,
      revertedFiles,
      restoredToHash: snapshotHash,
    }
  } catch (error) {
    return { success: false, error: `Revert failed: ${getErrorMessage(error)}` }
  }
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
  tokenUsage?: { inputTokens: number; outputTokens: number }
  /** Buffered chunks for replay on renderer reconnect (e.g. after HMR/refresh). */
  bufferedChunks: AgentChatStreamChunk[]
  /** Accumulated tool activity for smart title generation */
  toolsUsed: Array<{ name: string; filePath?: string }>
  /** Accumulated content blocks for message persistence — mirrors streaming blocks */
  accumulatedBlocks: import('./types').AgentChatContentBlock[]
}

const activeSends = new Map<string, ActiveStreamContext>()

function emitStreamChunk(
  listeners: Set<StreamChunkListener>,
  chunk: AgentChatStreamChunk,
  ctx?: ActiveStreamContext,
): void {
  // Buffer non-terminal chunks for replay on renderer reconnect
  if (ctx && chunk.type !== 'complete' && chunk.type !== 'error' && chunk.type !== 'thread_snapshot' as string) {
    ctx.bufferedChunks.push(chunk)
  }
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
          filePath?: string
          inputSummary?: string
          editSummary?: { oldLines: number; newLines: number }
        }
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId: ctx.threadId,
          messageId: ctx.assistantMessageId,
          type: 'tool_activity',
          toolActivity: {
            name: toolJson.name,
            status: toolJson.status,
            filePath: toolJson.filePath,
            inputSummary: toolJson.inputSummary,
            editSummary: toolJson.editSummary,
          },
          timestamp: now,
        }, ctx)
        // Track tool for smart title generation (only on 'running' to avoid duplicates)
        if (toolJson.status === 'running') {
          ctx.toolsUsed.push({ name: toolJson.name, filePath: toolJson.filePath })
          // Accumulate tool_use block for message persistence
          ctx.accumulatedBlocks.push({
            kind: 'tool_use',
            tool: toolJson.name,
            status: 'running',
            filePath: toolJson.filePath,
            blockId: `tool-${ctx.accumulatedBlocks.length}`,
          })
        } else if (toolJson.status === 'complete') {
          // Find and update the matching running tool block
          for (let i = ctx.accumulatedBlocks.length - 1; i >= 0; i--) {
            const block = ctx.accumulatedBlocks[i]
            if (block.kind === 'tool_use' && block.tool === toolJson.name && block.status === 'running') {
              ctx.accumulatedBlocks[i] = { ...block, status: 'complete', filePath: toolJson.filePath ?? block.filePath }
              break
            }
          }
        }
      } catch {
        // Malformed tool JSON — ignore
      }
    } else if (progress.message?.startsWith('__thinking__:')) {
      // Parse thinking block signal from the adapter
      const thinkingText = progress.message.slice('__thinking__:'.length)
      if (thinkingText) {
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId: ctx.threadId,
          messageId: ctx.assistantMessageId,
          type: 'thinking_delta',
          thinkingDelta: thinkingText,
          timestamp: now,
        }, ctx)
        // Accumulate thinking block for message persistence
        const lastBlock = ctx.accumulatedBlocks[ctx.accumulatedBlocks.length - 1]
        if (lastBlock && lastBlock.kind === 'thinking') {
          lastBlock.content += thinkingText
        } else {
          ctx.accumulatedBlocks.push({ kind: 'thinking', content: thinkingText })
        }
      }
    } else if (progress.message) {
      ctx.accumulatedText += progress.message
      emitStreamChunk(runtime.streamChunkListeners, {
        threadId: ctx.threadId,
        messageId: ctx.assistantMessageId,
        type: 'text_delta',
        textDelta: progress.message,
        timestamp: now,
      }, ctx)
      // Accumulate text block for message persistence
      const lastBlock = ctx.accumulatedBlocks[ctx.accumulatedBlocks.length - 1]
      if (lastBlock && lastBlock.kind === 'text') {
        lastBlock.content += progress.message
      } else {
        ctx.accumulatedBlocks.push({ kind: 'text', content: progress.message })
      }
    }
    ctx.firstChunkEmitted = true
  } else if (progress.status === 'completed') {
    // Capture token usage from the completed progress event
    if (progress.tokenUsage) {
      ctx.tokenUsage = progress.tokenUsage
    }

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
      tokenUsage: ctx.tokenUsage,
      costUsd: progress.costUsd,
      durationMs: progress.durationMs,
      timestamp: now,
      blocks: ctx.accumulatedBlocks,
    })

    // Persist the assistant message BEFORE emitting the `complete` chunk.
    // The renderer clears streaming blocks on `complete`, so the persisted
    // thread must be available first to avoid a flash of empty content.
    const threadId = ctx.threadId
    const assistantMessageId = ctx.assistantMessageId
    const taskId = ctx.taskId
    // Capture the Claude Code CLI session ID from the progress event now,
    // before the async block runs. sessionRef.sessionId is set when the
    // stream emits system:init, and progress.session is the same object.
    const claudeSessionIdFromStream = progress.session?.sessionId
    void (async () => {
      try {
        const thread = await runtime.threadStore.loadThread(threadId)
        const exists = thread?.messages.some((m) => m.id === assistantMessageId)
        let updatedThread: import('./types').AgentChatThreadRecord
        if (exists) {
          updatedThread = await runtime.threadStore.updateMessage(threadId, assistantMessageId, {
            content: assistantMessage.content,
            orchestration: assistantMessage.orchestration,
            toolsSummary: assistantMessage.toolsSummary,
            costSummary: assistantMessage.costSummary,
            durationSummary: assistantMessage.durationSummary,
            tokenUsage: assistantMessage.tokenUsage,
            blocks: assistantMessage.blocks,
          })
        } else {
          updatedThread = await runtime.threadStore.appendMessage(threadId, assistantMessage)
        }
        // Preserve sticky fields from the thread's current latestOrchestration
        // (set correctly by finalizeStartedTask). ctx.link was captured before the
        // adapter ran and may lack these values.
        const existing = thread?.latestOrchestration
        const freshLink: import('./types').AgentChatOrchestrationLink = {
          ...ctx.link,
          claudeSessionId: existing?.claudeSessionId ?? ctx.link.claudeSessionId ?? claudeSessionIdFromStream,
          linkedTerminalId: existing?.linkedTerminalId ?? ctx.link.linkedTerminalId,
        }
        await runtime.threadStore.updateThread(updatedThread.id, {
          status: 'complete',
          latestOrchestration: freshLink,
        })

        // Smart title (hybrid): if this is the first assistant message,
        // (1) set a heuristic title immediately, then
        // (2) fire an async LLM call to upgrade it with a better one.
        const isFirstResponse = updatedThread.messages.filter((m) => m.role === 'assistant').length <= 1
        if (isFirstResponse) {
          const userPrompt = updatedThread.messages.find((m) => m.role === 'user')?.content ?? ''
          const titleArgs = {
            userPrompt,
            responseText: ctx.accumulatedText,
            toolsUsed: ctx.toolsUsed,
          }

          // Step 1: Heuristic title (instant)
          const heuristicTitle = ctx.toolsUsed.length > 0 ? deriveSmartTitle(titleArgs) : null
          if (heuristicTitle) {
            await runtime.threadStore.updateThread(updatedThread.id, { title: heuristicTitle })
          }

          // Step 2: LLM title upgrade (async, fire-and-forget)
          // Runs after the thread snapshot is emitted so there's no delay.
          // Captures threadId to avoid closure over mutable ctx.
          const capturedThreadId = updatedThread.id
          void generateLlmTitle(titleArgs).then(async (llmTitle) => {
            if (llmTitle) {
              await runtime.threadStore.updateThread(capturedThreadId, { title: llmTitle })
              // Emit a lightweight thread_snapshot so the renderer picks up
              // the upgraded title without requiring a manual refresh.
              const refreshed = await runtime.threadStore.loadThread(capturedThreadId)
              if (refreshed) {
                emitStreamChunk(runtime.streamChunkListeners, {
                  threadId: capturedThreadId,
                  messageId: '',
                  type: 'thread_snapshot' as any,
                  timestamp: Date.now(),
                  thread: refreshed,
                } as any)
              }
            }
          }).catch(() => { /* heuristic title preserved on failure */ })
        }

        // Re-read the thread after updateThread so the snapshot includes the
        // fresh latestOrchestration (with linkedTerminalId) and updated title.
        const finalThread = await runtime.threadStore.loadThread(threadId) ?? updatedThread

        // Emit a thread_snapshot so the renderer can merge the final thread
        // (including the persisted assistant message) before clearing streaming.
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId,
          messageId: assistantMessageId,
          type: 'thread_snapshot' as any,
          timestamp: Date.now(),
          thread: finalThread,
        } as any)
      } catch (error) {
        console.error('[agentChat] completion persistence failed for thread', threadId, error)
      } finally {
        // Emit `complete` after persistence so the renderer sees the final
        // message in the thread before streaming blocks are cleared.
        // In a finally block to ensure the UI never freezes even if persistence throws.
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId,
          messageId: assistantMessageId,
          type: 'complete',
          timestamp: Date.now(),
        })
        activeSends.delete(taskId)
      }
    })()
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
    }).catch((error) => { console.error('[agentChat] failed to persist failure message for thread', ctx!.threadId, error) })

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
  // Capture git HEAD before the agent starts — used for revert support.
  const preSnapshotHash = await captureHeadHash(args.pending.thread.workspaceRoot)

  const created = await args.orchestration.createTask(args.pending.taskRequest)
  if (!created.success || !created.taskId || !created.session) {
    console.error('[agentChat] createTask failed:', created.error)
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

  // Attach the pre-snapshot hash to the link for revert support
  if (preSnapshotHash) {
    linked.link.preSnapshotHash = preSnapshotHash
  }

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
    bufferedChunks: [],
    toolsUsed: [],
    accumulatedBlocks: [],
  }
  activeSends.set(created.taskId, streamCtx)

  const started = await args.orchestration.startTask(created.taskId)
  if (!started.success) {
    console.error('[agentChat] startTask failed:', started.error)
  }
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

  // Guard against concurrent sends to the same thread. If a task is already
  // in-flight for this thread, reject the new send rather than spawning a
  // duplicate agent session (which would cause two responses in one thread).
  if (request.threadId) {
    for (const [, ctx] of activeSends) {
      if (ctx.threadId === request.threadId) {
        return buildSendFailureResult({
          error: 'A task is already running for this thread. Wait for it to finish or stop it first.',
        })
      }
    }
  }

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
    console.error('[agentChat] sendMessage failed:', getErrorMessage(error))
    if (error instanceof Error && error.stack) console.error(error.stack)
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
    getActiveThreadIds(): string[] {
      return Array.from(activeSends.values()).map((ctx) => ctx.threadId)
    },
    getBufferedChunks(threadId: string): AgentChatStreamChunk[] {
      for (const [, ctx] of activeSends) {
        if (ctx.threadId === threadId) return [...ctx.bufferedChunks]
      }
      return []
    },
    revertToSnapshot: (threadId, messageId) =>
      revertToSnapshotWithBridge(runtime.threadStore, threadId, messageId),
    dispose: () => {
      unsubProviderEvent()
      streamChunkListeners.clear()
      activeSends.clear()
    },
  }
}
