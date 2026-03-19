import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { unlink } from 'fs/promises'
import { join } from 'path'

import { getConfigValue } from '../config'
import type { HookPayload } from '../hooks'
import { dispatchSyntheticHookEvent } from '../hooks'
import type { OrchestrationAPI, ProviderProgressEvent } from '../orchestration/types'
import {
  buildAgentChatOrchestrationLink,
  buildAssistantMessageId,
  buildSendFailureResult,
  buildSendSuccessResult,
  createOrchestrationFailure,
  mapOrchestrationStatusToAgentChatStatus,
  persistThreadLinkage,
} from './chatOrchestrationBridgeSupport'
import {
  deriveSmartTitle,
  generateLlmTitle,
  type PreparedSend,
  preparePendingSend,
  resolveSendOptions,
  validateSendRequest,
} from './chatOrchestrationRequestSupport'
import {
  projectProviderFailureToAssistantMessage,
  projectProviderResultToAssistantMessage,
} from './responseProjector'
import { resolveAgentChatSettings, type ResolvedAgentChatSettings } from './settingsResolver'
import { type AgentChatThreadStore,agentChatThreadStore } from './threadStore'
import type {
  AgentChatContentBlock,
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatRevertResult,
  AgentChatSendMessageRequest,
  AgentChatSendResult,
  AgentChatStreamChunk,
  AgentChatThreadRecord,
} from './types'
import { getErrorMessage } from './utils'

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
  revertToSnapshot: (threadId: string, messageId: string) => Promise<AgentChatRevertResult>
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
  activeSends: Map<string, ActiveStreamContext>
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
      if (err) reject(err); else resolve(stdout)
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
  activeSends: Map<string, ActiveStreamContext>,
  threadId: string,
  messageId: string,
): Promise<AgentChatRevertResult> {
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
  /** Resolved model ID (e.g. 'claude-opus-4-6') for this send. */
  model?: string
  /** Buffered chunks for replay on renderer reconnect (e.g. after HMR/refresh). */
  bufferedChunks: AgentChatStreamChunk[]
  /** Accumulated tool activity for smart title generation */
  toolsUsed: Array<{ name: string; filePath?: string }>
  /** Accumulated content blocks for message persistence — mirrors streaming blocks */
  accumulatedBlocks: AgentChatContentBlock[]
  /** Whether agent_start has been emitted to Agent Monitor for this session */
  monitorStartEmitted: boolean
  /** Claude Code CLI session ID (from system:init), used for Agent Monitor events */
  claudeSessionId?: string
  /** User prompt for this thread — used as task label in the Agent Monitor */
  userPrompt?: string
  /** Timer handle for periodic incremental persistence flush. */
  flushTimer?: ReturnType<typeof setInterval>
  /** Set to true when a terminal event fires — prevents in-flight flushes from overwriting the final message. */
  streamEnded: boolean
}

function emitStreamChunk(
  listeners: Set<StreamChunkListener>,
  chunk: AgentChatStreamChunk,
  ctx?: ActiveStreamContext,
): void {
  // Buffer non-terminal chunks for replay on renderer reconnect
  if (ctx && chunk.type !== 'complete' && chunk.type !== 'error' && chunk.type !== 'thread_snapshot') {
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

// ---------------------------------------------------------------------------
// Agent Monitor bridge — forward tool activity to Agent Monitor via synthetic
// hook events so the monitor always shows tool calls for chat sessions,
// regardless of whether the external hook scripts succeed.
// ---------------------------------------------------------------------------

function ensureMonitorSessionStarted(ctx: ActiveStreamContext, now: number): void {
  if (ctx.monitorStartEmitted) return
  ctx.monitorStartEmitted = true

  const sessionId = ctx.claudeSessionId ?? ctx.sessionId
  dispatchSyntheticHookEvent({
    type: 'agent_start',
    sessionId,
    taskLabel: ctx.userPrompt ?? `Chat ${ctx.threadId.slice(0, 8)}`,
    prompt: ctx.userPrompt,
    timestamp: now,
  })
}

function emitMonitorToolStart(ctx: ActiveStreamContext, blockIndex: number, toolActivity: {
  name: string
  filePath?: string
  inputSummary?: string
}, now: number): void {
  const sessionId = ctx.claudeSessionId ?? ctx.sessionId
  ensureMonitorSessionStarted(ctx, now)

  const input: Record<string, unknown> = {}
  if (toolActivity.filePath) input.file_path = toolActivity.filePath
  if (toolActivity.inputSummary) input.description = toolActivity.inputSummary

  dispatchSyntheticHookEvent({
    type: 'pre_tool_use',
    sessionId,
    toolName: toolActivity.name,
    toolCallId: `stream-${sessionId}-${blockIndex}`,
    input,
    timestamp: now,
  } as HookPayload)
}

function emitMonitorToolEnd(ctx: ActiveStreamContext, blockIndex: number, toolName: string, now: number): void {
  const sessionId = ctx.claudeSessionId ?? ctx.sessionId
  dispatchSyntheticHookEvent({
    type: 'post_tool_use',
    sessionId,
    toolName,
    toolCallId: `stream-${sessionId}-${blockIndex}`,
    timestamp: now,
  } as HookPayload)
}

function emitMonitorSessionEnd(ctx: ActiveStreamContext, now: number, error?: string): void {
  const sessionId = ctx.claudeSessionId ?? ctx.sessionId
  if (!ctx.monitorStartEmitted) return // Never started — don't emit end

  const payload: HookPayload = {
    type: 'agent_end',
    sessionId,
    timestamp: now,
  }
  if (error) (payload as Record<string, unknown>).error = error
  // Forward token usage so the Agent Monitor shows costs for chat sessions
  if (ctx.tokenUsage) {
    payload.usage = {
      input_tokens: ctx.tokenUsage.inputTokens,
      output_tokens: ctx.tokenUsage.outputTokens,
    }
  }
  dispatchSyntheticHookEvent(payload)
}

// ---------------------------------------------------------------------------
// Incremental persistence — periodic flush of accumulated content to SQLite
// so that a crash loses at most a few seconds of output.
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 5000

function stopIncrementalFlush(ctx: ActiveStreamContext): void {
  ctx.streamEnded = true
  if (ctx.flushTimer) {
    clearInterval(ctx.flushTimer)
    ctx.flushTimer = undefined
  }
}

async function flushPartialMessage(runtime: AgentChatBridgeRuntime, ctx: ActiveStreamContext): Promise<void> {
  if (ctx.streamEnded) return
  if (!ctx.firstChunkEmitted) return

  const partialMessage = projectProviderResultToAssistantMessage({
    threadId: ctx.threadId,
    messageId: ctx.assistantMessageId,
    responseText: ctx.accumulatedText,
    orchestrationLink: ctx.link,
    tokenUsage: ctx.tokenUsage,
    model: ctx.model,
    timestamp: runtime.now(),
    blocks: ctx.accumulatedBlocks,
  })

  // Override with raw streaming blocks — skip mergeAdjacentTextBlocks during
  // incremental flushes to keep the persisted block structure identical to
  // streaming state. Merging only happens at final completion time. This
  // prevents the renderer from showing merged blocks that look like duplicated
  // text when the display switches from streaming to persisted mid-stream.
  if (ctx.accumulatedBlocks.length > 0) {
    partialMessage.blocks = ctx.accumulatedBlocks.map((b) => ({ ...b }))
  }

  // Re-check after building the message — the stream may have ended while computing
  if (ctx.streamEnded) return

  try {
    const thread = await runtime.threadStore.loadThread(ctx.threadId)
    // Final check after async load — if stream ended during the load, bail out
    // to avoid overwriting the final completed message with partial content
    if (ctx.streamEnded) return

    const exists = thread?.messages.some((m) => m.id === ctx.assistantMessageId)
    if (exists) {
      await runtime.threadStore.updateMessage(ctx.threadId, ctx.assistantMessageId, {
        content: partialMessage.content,
        orchestration: partialMessage.orchestration,
        toolsSummary: partialMessage.toolsSummary,
        blocks: partialMessage.blocks,
      })
    } else {
      await runtime.threadStore.appendMessage(ctx.threadId, partialMessage)
    }
  } catch (error) {
    console.warn('[agentChat] incremental flush failed for thread', ctx.threadId, error)
  }
}

function startIncrementalFlush(runtime: AgentChatBridgeRuntime, ctx: ActiveStreamContext): void {
  ctx.flushTimer = setInterval(() => {
    if (ctx.streamEnded || ctx.flushTimer === undefined) return
    void flushPartialMessage(runtime, ctx)
  }, FLUSH_INTERVAL_MS)
}

function handleProviderProgress(
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
): void {
  // Find matching active send by session reference.
  // Three fallback strategies: sessionId match, externalTaskId match, or
  // requestId containing the task ID (set by the adapter as "orchestration-{taskId}").
  let ctx: ActiveStreamContext | undefined
  for (const [, entry] of runtime.activeSends) {
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

  // Capture the Claude Code session ID for Agent Monitor events
  if (progress.session?.sessionId && !ctx.claudeSessionId) {
    ctx.claudeSessionId = progress.session.sessionId
  }

  const now = runtime.now()

  if (progress.status === 'streaming') {
    // --- Structured content block path (block-indexed) ---
    if (progress.contentBlock) {
      const { blockIndex, blockType, textDelta, toolActivity } = progress.contentBlock

      // Ensure accumulatedBlocks array is large enough for this block index
      while (ctx.accumulatedBlocks.length <= blockIndex) {
        ctx.accumulatedBlocks.push({ kind: 'text', content: '' })
      }

      if (blockType === 'text' && textDelta) {
        ctx.accumulatedText += textDelta
        const existing = ctx.accumulatedBlocks[blockIndex]
        if (existing.kind === 'text') {
          (existing as { kind: 'text'; content: string }).content += textDelta
        } else {
          ctx.accumulatedBlocks[blockIndex] = { kind: 'text', content: textDelta }
        }
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId: ctx.threadId,
          messageId: ctx.assistantMessageId,
          type: 'text_delta',
          blockIndex,
          textDelta,
          timestamp: now,
        }, ctx)
      } else if (blockType === 'thinking' && textDelta) {
        const existing = ctx.accumulatedBlocks[blockIndex]
        if (existing.kind === 'thinking') {
          (existing as { kind: 'thinking'; content: string }).content += textDelta
        } else {
          ctx.accumulatedBlocks[blockIndex] = { kind: 'thinking', content: textDelta }
        }
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId: ctx.threadId,
          messageId: ctx.assistantMessageId,
          type: 'thinking_delta',
          blockIndex,
          thinkingDelta: textDelta,
          timestamp: now,
        }, ctx)
      } else if (blockType === 'tool_use' && toolActivity) {
        if (toolActivity.status === 'running') {
          ctx.accumulatedBlocks[blockIndex] = {
            kind: 'tool_use',
            tool: toolActivity.name,
            status: 'running',
            filePath: toolActivity.filePath,
            inputSummary: toolActivity.inputSummary,
            editSummary: toolActivity.editSummary,
            blockId: `tool-${blockIndex}`,
          }
          ctx.toolsUsed.push({ name: toolActivity.name, filePath: toolActivity.filePath })
          // Forward to Agent Monitor
          emitMonitorToolStart(ctx, blockIndex, toolActivity, now)
        } else if (toolActivity.status === 'complete') {
          const block = ctx.accumulatedBlocks[blockIndex]
          if (block.kind === 'tool_use') {
            ctx.accumulatedBlocks[blockIndex] = { ...block, status: 'complete' }
          }
          // Forward to Agent Monitor
          emitMonitorToolEnd(ctx, blockIndex, toolActivity.name, now)
        }
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId: ctx.threadId,
          messageId: ctx.assistantMessageId,
          type: 'tool_activity',
          blockIndex,
          toolActivity: {
            name: toolActivity.name,
            status: toolActivity.status,
            filePath: toolActivity.filePath,
            inputSummary: toolActivity.inputSummary,
            editSummary: toolActivity.editSummary,
          },
          timestamp: now,
        }, ctx)
      }
      ctx.firstChunkEmitted = true
    } else if (progress.message) {
      // Legacy fallback for unstructured events (diagnostics, status messages).
      // Appends to the last text block or creates a new one.
      ctx.accumulatedText += progress.message
      const lastBlock = ctx.accumulatedBlocks[ctx.accumulatedBlocks.length - 1]
      if (lastBlock && lastBlock.kind === 'text') {
        (lastBlock as { kind: 'text'; content: string }).content += progress.message
      } else {
        ctx.accumulatedBlocks.push({ kind: 'text', content: progress.message })
      }
      emitStreamChunk(runtime.streamChunkListeners, {
        threadId: ctx.threadId,
        messageId: ctx.assistantMessageId,
        type: 'text_delta',
        textDelta: progress.message,
        timestamp: now,
      }, ctx)
      ctx.firstChunkEmitted = true
    }
  } else if (progress.status === 'completed') {
    // Stop incremental flush before final persist to prevent race condition
    stopIncrementalFlush(ctx)

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
      model: ctx.model,
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
        let updatedThread: AgentChatThreadRecord
        if (exists) {
          updatedThread = await runtime.threadStore.updateMessage(threadId, assistantMessageId, {
            content: assistantMessage.content,
            orchestration: assistantMessage.orchestration,
            toolsSummary: assistantMessage.toolsSummary,
            costSummary: assistantMessage.costSummary,
            durationSummary: assistantMessage.durationSummary,
            tokenUsage: assistantMessage.tokenUsage,
            model: assistantMessage.model,
            blocks: assistantMessage.blocks,
          })
        } else {
          updatedThread = await runtime.threadStore.appendMessage(threadId, assistantMessage)
        }
        // Preserve sticky fields from the thread's current latestOrchestration
        // (set correctly by finalizeStartedTask). ctx.link was captured before the
        // adapter ran and may lack these values.
        const existing = thread?.latestOrchestration
        const freshLink: AgentChatOrchestrationLink = {
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
                  type: 'thread_snapshot',
                  timestamp: Date.now(),
                  thread: refreshed,
                })
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
          type: 'thread_snapshot',
          timestamp: Date.now(),
          thread: finalThread,
        })
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
        // Notify Agent Monitor that the session is done
        emitMonitorSessionEnd(ctx, Date.now())
        runtime.activeSends.delete(taskId)
      }
    })()
  } else if (progress.status === 'cancelled') {
    // Stop incremental flush before cancel persist
    stopIncrementalFlush(ctx)

    // Persist whatever the agent accomplished before cancellation.
    // Without this, all accumulated text/blocks are lost and the user sees
    // only "Task cancelled" with no content.
    const threadId = ctx.threadId
    const assistantMessageId = ctx.assistantMessageId
    const taskId = ctx.taskId
    const hasContent = ctx.accumulatedText.length > 0 || ctx.accumulatedBlocks.length > 0

    if (hasContent) {
      // Build the partial assistant message from accumulated content
      const partialMessage = projectProviderResultToAssistantMessage({
        threadId,
        messageId: assistantMessageId,
        responseText: ctx.accumulatedText,
        orchestrationLink: ctx.link,
        tokenUsage: ctx.tokenUsage,
        model: ctx.model,
        timestamp: now,
        blocks: ctx.accumulatedBlocks,
      })

      void (async () => {
        try {
          const thread = await runtime.threadStore.loadThread(threadId)
          const exists = thread?.messages.some((m) => m.id === assistantMessageId)
          let updatedThread: AgentChatThreadRecord
          if (exists) {
            updatedThread = await runtime.threadStore.updateMessage(threadId, assistantMessageId, {
              content: partialMessage.content,
              orchestration: partialMessage.orchestration,
              toolsSummary: partialMessage.toolsSummary,
              blocks: partialMessage.blocks,
            })
          } else {
            updatedThread = await runtime.threadStore.appendMessage(threadId, partialMessage)
          }
          await runtime.threadStore.updateThread(updatedThread.id, {
            status: 'cancelled',
            latestOrchestration: ctx.link,
          })

          const finalThread = await runtime.threadStore.loadThread(threadId) ?? updatedThread
          emitStreamChunk(runtime.streamChunkListeners, {
            threadId,
            messageId: assistantMessageId,
            type: 'thread_snapshot',
            timestamp: Date.now(),
            thread: finalThread,
          })
        } catch (error) {
          console.error('[agentChat] cancel persistence failed for thread', threadId, error)
        } finally {
          emitStreamChunk(runtime.streamChunkListeners, {
            threadId,
            messageId: assistantMessageId,
            type: 'complete',
            timestamp: Date.now(),
          })
          emitMonitorSessionEnd(ctx, Date.now(), 'Cancelled')
          runtime.activeSends.delete(taskId)
        }
      })()
    } else {
      // No content accumulated — just clean up
      emitStreamChunk(runtime.streamChunkListeners, {
        threadId: ctx.threadId,
        messageId: ctx.assistantMessageId,
        type: 'complete',
        timestamp: now,
      })
      // Update thread status to cancelled in the store
      void runtime.threadStore.updateThread(threadId, { status: 'cancelled' }).catch(() => {})
      emitMonitorSessionEnd(ctx, now, 'Cancelled')
      runtime.activeSends.delete(ctx.taskId)
    }
  } else if (progress.status === 'failed') {
    // Stop incremental flush before failure persist
    stopIncrementalFlush(ctx)

    const threadId = ctx.threadId
    const assistantMessageId = ctx.assistantMessageId
    const taskId = ctx.taskId
    const errorMessage = progress.message || 'Provider task failed.'
    const hasContent = ctx.accumulatedText.length > 0 || ctx.accumulatedBlocks.length > 0

    if (hasContent) {
      // Agent produced partial content before failing — persist it with the error
      const partialMessage = projectProviderResultToAssistantMessage({
        threadId,
        messageId: assistantMessageId,
        responseText: ctx.accumulatedText,
        orchestrationLink: ctx.link,
        tokenUsage: ctx.tokenUsage,
        model: ctx.model,
        timestamp: now,
        blocks: ctx.accumulatedBlocks,
      })
      partialMessage.error = {
        code: 'orchestration_failed',
        message: errorMessage,
        recoverable: true,
      }

      void (async () => {
        try {
          const thread = await runtime.threadStore.loadThread(threadId)
          const exists = thread?.messages.some((m) => m.id === assistantMessageId)
          let updatedThread: AgentChatThreadRecord
          if (exists) {
            updatedThread = await runtime.threadStore.updateMessage(threadId, assistantMessageId, {
              content: partialMessage.content,
              orchestration: partialMessage.orchestration,
              toolsSummary: partialMessage.toolsSummary,
              blocks: partialMessage.blocks,
              error: partialMessage.error,
            })
          } else {
            updatedThread = await runtime.threadStore.appendMessage(threadId, partialMessage)
          }
          await runtime.threadStore.updateThread(updatedThread.id, {
            status: 'failed',
            latestOrchestration: ctx.link,
          })

          const finalThread = await runtime.threadStore.loadThread(threadId) ?? updatedThread
          emitStreamChunk(runtime.streamChunkListeners, {
            threadId,
            messageId: assistantMessageId,
            type: 'thread_snapshot',
            timestamp: Date.now(),
            thread: finalThread,
          })
        } catch (error) {
          console.error('[agentChat] failure persistence failed for thread', threadId, error)
        } finally {
          emitStreamChunk(runtime.streamChunkListeners, {
            threadId,
            messageId: assistantMessageId,
            type: 'error',
            textDelta: errorMessage,
            timestamp: Date.now(),
          })
          emitMonitorSessionEnd(ctx, Date.now(), errorMessage)
          runtime.activeSends.delete(taskId)
        }
      })()
    } else {
      // No content accumulated — persist just the failure message
      const failureMessage = projectProviderFailureToAssistantMessage({
        threadId,
        messageId: assistantMessageId,
        errorMessage,
        orchestrationLink: ctx.link,
        timestamp: now,
      })

      void (async () => {
        try {
          const thread = await runtime.threadStore.loadThread(threadId)
          const exists = thread?.messages.some((m) => m.id === assistantMessageId)
          let updatedThread: AgentChatThreadRecord
          if (exists) {
            updatedThread = await runtime.threadStore.updateMessage(threadId, assistantMessageId, {
              content: failureMessage.content,
              orchestration: failureMessage.orchestration,
              error: failureMessage.error,
            })
          } else {
            updatedThread = await runtime.threadStore.appendMessage(threadId, failureMessage)
          }
          await runtime.threadStore.updateThread(updatedThread.id, {
            status: 'failed',
            latestOrchestration: ctx.link,
          })

          const finalThread = await runtime.threadStore.loadThread(threadId) ?? updatedThread
          emitStreamChunk(runtime.streamChunkListeners, {
            threadId,
            messageId: assistantMessageId,
            type: 'thread_snapshot',
            timestamp: Date.now(),
            thread: finalThread,
          })
        } catch (error) {
          console.error('[agentChat] failure persistence failed for thread', threadId, error)
        } finally {
          emitStreamChunk(runtime.streamChunkListeners, {
            threadId,
            messageId: assistantMessageId,
            type: 'error',
            textDelta: errorMessage,
            timestamp: Date.now(),
          })
          emitMonitorSessionEnd(ctx, Date.now(), errorMessage)
          runtime.activeSends.delete(taskId)
        }
      })()
    }
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
  const userPrompt = args.pending.thread.messages.find((m) => m.role === 'user')?.content
  const streamCtx: ActiveStreamContext = {
    threadId: args.pending.thread.id,
    assistantMessageId,
    taskId: created.taskId,
    sessionId: created.session.id,
    link: linked.link,
    accumulatedText: '',
    firstChunkEmitted: false,
    model: args.pending.taskRequest.model,
    bufferedChunks: [],
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    userPrompt: userPrompt?.slice(0, 120),
    streamEnded: false,
  }
  args.runtime.activeSends.set(created.taskId, streamCtx)

  // Safety net: wrap everything after activeSends.set in try/catch so that
  // unexpected exceptions (from startIncrementalFlush, startTask, or
  // finalizeStartedTask) always clean up the activeSends entry. Without this,
  // an unhandled throw would permanently lock the thread.
  try {
    // Start incremental persistence flush
    startIncrementalFlush(args.runtime, streamCtx)

    let started: Awaited<ReturnType<typeof args.orchestration.startTask>>
    try {
      started = await args.orchestration.startTask(created.taskId)
    } catch (err) {
      // startTask threw — no progress callback will ever fire, so clean up now.
      stopIncrementalFlush(streamCtx)
      args.runtime.activeSends.delete(created.taskId)
      throw err
    }

    if (!started.success) {
      console.error('[agentChat] startTask failed:', started.error)
      // startTask returned a failure — no progress callback will fire for this
      // task, so remove it from activeSends to prevent a permanent lock.
      stopIncrementalFlush(streamCtx)
      args.runtime.activeSends.delete(created.taskId)
    }

    return finalizeStartedTask({
      fallbackLink: linked.link,
      linkedThread: linked.thread,
      pending: args.pending,
      started,
      threadStore: args.threadStore,
    })
  } catch (err) {
    // Outer safety net: if anything after activeSends.set threw unexpectedly,
    // ensure the entry is removed so the thread isn't permanently locked.
    stopIncrementalFlush(streamCtx)
    args.runtime.activeSends.delete(created.taskId)
    throw err
  }
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
    for (const [, ctx] of runtime.activeSends) {
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

    // Return the thread to the renderer immediately so the UI updates
    // (shows user message + snake animation).  The orchestration
    // (context packet + Claude Code launch) runs in the background —
    // the renderer picks up status changes via IPC event listeners.
    void executePendingSend({
      orchestration: runtime.orchestration,
      pending,
      runtime,
      threadStore: runtime.threadStore,
    }).catch((err) => {
      console.error('[agentChat] background executePendingSend failed:', getErrorMessage(err))
    })

    return {
      success: true,
      thread: pending.thread,
      message: pending.thread.messages.find((m) => m.id === pending.messageId),
    } as AgentChatSendResult
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
  const activeSends = new Map<string, ActiveStreamContext>()
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
    activeSends,
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
      return Array.from(runtime.activeSends.values()).map((ctx) => ctx.threadId)
    },
    getBufferedChunks(threadId: string): AgentChatStreamChunk[] {
      for (const [, ctx] of runtime.activeSends) {
        if (ctx.threadId === threadId) return [...ctx.bufferedChunks]
      }
      return []
    },
    revertToSnapshot: (threadId, messageId) =>
      revertToSnapshotWithBridge(runtime.threadStore, runtime.activeSends, threadId, messageId),
    dispose: () => {
      unsubProviderEvent()
      streamChunkListeners.clear()
      for (const [, ctx] of runtime.activeSends) {
        stopIncrementalFlush(ctx)
      }
      runtime.activeSends.clear()
    },
  }
}
