/**
 * agentChat.ts — IPC handlers for agent chat.
 *
 * Wires the AgentChatService to ipcMain.handle() for all
 * agentChat invoke channels, and forwards events to the renderer.
 */

import { type BrowserWindow, ipcMain } from 'electron'

import {
  AGENT_CHAT_EVENT_CHANNELS,
  AGENT_CHAT_INVOKE_CHANNELS,
  type AgentChatService,
  createAgentChatService,
} from '../agentChat'
import {
  buildAgentChatOrchestrationLink,
  mapOrchestrationStatusToAgentChatStatus,
} from '../agentChat/chatOrchestrationBridgeSupport'
import { projectAgentChatSession } from '../agentChat/eventProjector'
import { agentChatThreadStore } from '../agentChat/threadStore'
import type {
  AgentChatCreateThreadRequest,
  AgentChatOrchestrationLink,
  AgentChatSendMessageRequest,
} from '../agentChat/types'
import { buildContextPacket } from '../orchestration/contextPacketBuilder'
import { buildGraphSummary, formatGraphSummary, type GraphSummary } from '../orchestration/graphSummaryBuilder'
import { createClaudeCodeAdapter } from '../orchestration/providers/claudeCodeAdapter'
import type { ProviderAdapter, ProviderProgressSink } from '../orchestration/providers/providerAdapter'
import { buildRepoIndexSnapshot } from '../orchestration/repoIndexer'
import type {
  ContextPacket,
  OrchestrationProvider,
  ProviderProgressEvent,
  TaskMutationResult,
  TaskRequest,
  TaskSessionRecord,
  TaskSessionResult,
} from '../orchestration/types'
import { broadcastToWebClients } from '../web/webServer'
// NOTE: buildGraphSummary uses the native GraphController (src/main/codebaseGraph),
// NOT the external codebase-memory MCP server. Zero external dependencies.

/**
 * Minimal orchestration facade for the chat bridge.
 *
 * The full AgentLoopController (with session store, verification runner,
 * diff summarizer, and multi-provider registry) was removed as dead code.
 * This facade provides only the methods the chat bridge actually uses,
 * delegating directly to the Claude Code adapter.
 */
/**
 * Eagerly-built repo snapshot cache.
 *
 * Built once on startup (or when workspace roots change) so that by the
 * time the user sends their first chat message the context is already warm.
 * Invalidated by file-system events and git operations.
 */
interface CachedContext {
  snapshot: RepoIndexSnapshot
  graphSummary: GraphSummary
  builtAt: number
}

const contextCache = new Map<string, CachedContext>()
const contextBuildInFlight = new Map<string, Promise<CachedContext | null>>()
const CONTEXT_MAX_AGE_MS = 60_000 // rebuild if older than 60s

function cacheKey(roots: string[]): string {
  return [...roots].sort().join('|')
}

/** Trigger a background build of repo snapshot + graph summary. */
export function warmSnapshotCache(roots: string[]): void {
  if (!roots.length) return
  const key = cacheKey(roots)
  if (contextBuildInFlight.has(key)) return // already building

  const buildPromise = (async (): Promise<CachedContext | null> => {
    try {
      // Build repo snapshot and graph summary in parallel
      const [snapshot, graphSummary] = await Promise.all([
        buildRepoIndexSnapshot(roots),
        buildGraphSummary(roots[0]).catch((err) => {
          console.warn('[agentChat] graph summary build failed (non-fatal):', err)
          return { hotspots: [], blastRadius: [], builtAt: 0 } as GraphSummary
        }),
      ])
      const entry: CachedContext = { snapshot, graphSummary, builtAt: Date.now() }
      contextCache.set(key, entry)
      return entry
    } catch (err) {
      console.warn('[agentChat] background context build failed:', err)
      return null
    } finally {
      contextBuildInFlight.delete(key)
    }
  })()
  contextBuildInFlight.set(key, buildPromise)
}

/** Get cached context, or wait for an in-flight build (with timeout). */
async function getOrBuildContext(roots: string[], timeoutMs = 15_000): Promise<CachedContext | null> {
  const key = cacheKey(roots)

  const cached = contextCache.get(key)
  if (cached && Date.now() - cached.builtAt < CONTEXT_MAX_AGE_MS) {
    return cached
  }

  if (!contextBuildInFlight.has(key)) {
    warmSnapshotCache(roots)
  }
  const pending = contextBuildInFlight.get(key)
  if (!pending) return null

  return Promise.race([
    pending,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ])
}

/** Invalidate the cache (e.g. after git ops, file saves, Claude Code runs). */
export function invalidateSnapshotCache(roots?: string[]): void {
  if (roots) {
    contextCache.delete(cacheKey(roots))
  } else {
    contextCache.clear()
  }
}

/**
 * Provider registry — maps provider names to adapter factories.
 * When Codex or other providers are added, register them here.
 * The orchestration facade selects the right adapter based on request.provider.
 */
const providerRegistry = new Map<OrchestrationProvider, () => ProviderAdapter>([
  ['claude-code', () => createClaudeCodeAdapter()],
  // ['codex', () => createCodexAdapter()],    // future
  // ['anthropic-api', () => createAnthropicApiAdapter()],  // future
])

/**
 * Adapter instance cache — ensures the SAME adapter instance is used across
 * startTask and cancelTask calls. Without this, each getAdapter() call would
 * produce a new instance, meaning cancel could never find the running process
 * (even though ClaudeCodeAdapter currently uses module-level Maps, future
 * instance-level state would silently break cancellation again).
 */
const adapterCache = new Map<OrchestrationProvider, ProviderAdapter>()

function getAdapter(provider: OrchestrationProvider): ProviderAdapter {
  const cached = adapterCache.get(provider)
  if (cached) return cached
  const factory = providerRegistry.get(provider)
  if (!factory) {
    throw new Error(`No adapter registered for provider: ${provider}`)
  }
  const adapter = factory()
  adapterCache.set(provider, adapter)
  return adapter
}

function createMinimalOrchestration() {
  // Default adapter for backward compatibility; overridden per-task by request.provider.
  // Use the cache so startTask and cancelTask always share the same instance.
  const defaultAdapter = getAdapter('claude-code')
  const sessions = new Map<string, TaskSessionRecord>()
  const providerListeners = new Set<(event: ProviderProgressEvent) => void>()
  const sessionListeners = new Set<(session: TaskSessionRecord) => void>()

  function createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  return {
    async createTask(request: TaskRequest): Promise<TaskMutationResult> {
      const taskId = request.taskId ?? createId('task')
      const sessionId = request.sessionId ?? createId('session')

      // Grab the pre-built context (warmed on startup). Includes both the
      // repo snapshot and graph summary (hotspots + blast radius).
      let contextPacket: ContextPacket | undefined
      const ctx = await getOrBuildContext(request.workspaceRoots)
      if (ctx) {
        try {
          const result = await buildContextPacket({ request, repoFacts: ctx.snapshot.repoFacts, model: request.model, repoSnapshot: ctx.snapshot })
          contextPacket = result.packet
          // Store graph summary on the context packet for injection into the prompt.
          // (ContextPacket has no systemPrompt field — graphSummary is the correct carrier.)
          if (contextPacket) {
            const graphSection = formatGraphSummary(ctx.graphSummary)
            if (graphSection) {
              contextPacket.graphSummary = graphSection
            }
          }
        } catch { /* context is best-effort */ }
      }

      const session: TaskSessionRecord = {
        version: 1, id: sessionId, taskId,
        workspaceRoots: request.workspaceRoots,
        createdAt: Date.now(), updatedAt: Date.now(),
        request: { ...request, taskId, sessionId },
        status: 'idle', attempts: [], unresolvedIssues: [],
        contextPacket,
      }
      sessions.set(taskId, session)
      return { success: true, taskId, session, state: { status: 'idle', updatedAt: Date.now() } }
    },

    async startTask(taskId: string): Promise<TaskMutationResult> {
      const session = sessions.get(taskId)
      if (!session) return { success: false, error: `Task ${taskId} not found` }

      const sink: ProviderProgressSink = {
        emit: (event: ProviderProgressEvent) => {
          providerListeners.forEach((listener) => listener(event))
        },
      }

      // Select adapter based on the task's provider (falls back to default)
      const adapter = providerRegistry.has(session.request.provider)
        ? getAdapter(session.request.provider)
        : defaultAdapter

      try {
        const launched = await adapter.submitTask({
          taskId: session.taskId,
          sessionId: session.id,
          attemptId: createId('attempt'),
          request: session.request,
          contextPacket: session.contextPacket!,
          window: null,
        }, sink)
        const updated = { ...session, status: 'applying' as const, updatedAt: Date.now(), providerSession: launched.session }
        sessions.set(taskId, updated)
        sessionListeners.forEach((l) => l(updated))
        return { success: true, taskId, session: updated, state: { status: 'applying', updatedAt: Date.now() } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, taskId }
      }
    },

    async loadSession(sessionId: string): Promise<TaskSessionResult> {
      for (const session of sessions.values()) {
        if (session.id === sessionId) return { success: true, session }
      }
      return { success: false, error: `Session ${sessionId} not found` }
    },

    onProviderEvent(callback: (event: ProviderProgressEvent) => void): () => void {
      providerListeners.add(callback)
      return () => providerListeners.delete(callback)
    },

    onSessionUpdate(callback: (session: TaskSessionRecord) => void): () => void {
      sessionListeners.add(callback)
      return () => sessionListeners.delete(callback)
    },

    async cancelTask(taskId: string): Promise<TaskMutationResult> {
      const session = sessions.get(taskId)
      if (!session) return { success: false, error: `Task ${taskId} not found` }
      if (session.providerSession) {
        const cancelAdapter = providerRegistry.has(session.request.provider)
          ? getAdapter(session.request.provider)
          : defaultAdapter
        await cancelAdapter.cancelTask(session.providerSession)
      }
      const cancelled = { ...session, status: 'cancelled' as const, updatedAt: Date.now() }
      sessions.set(taskId, cancelled)
      sessionListeners.forEach((l) => l(cancelled))
      return { success: true, taskId, session: cancelled, state: { status: 'cancelled', updatedAt: Date.now() } }
    },
  }
}

let orchestration: ReturnType<typeof createMinimalOrchestration> | null = null

function getOrchestration() {
  if (!orchestration) orchestration = createMinimalOrchestration()
  return orchestration
}

let service: AgentChatService | null = null
const cleanupFns: Array<() => void> = []
/** Module-level channel list so cleanupAgentChatHandlers can remove them. */
let registeredChannels: string[] = []

function getService(): AgentChatService {
  if (!service) {
    service = createAgentChatService({
      orchestration: getOrchestration(),
    })
  }
  return service
}

// ─── Runtime input validation helpers ────────────────────────────────────────
//
// All agentChat IPC handlers receive `unknown` args from the renderer.
// These helpers validate before passing to service methods, preventing
// `TypeError: Cannot read properties of undefined` deep in service code.

function requireValidString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${name}: expected non-empty string, got ${typeof value}`)
  }
  return value.trim()
}

function requireValidObject(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${name}: expected object, got ${typeof value}`)
  }
  return value as Record<string, unknown>
}

export function registerAgentChatHandlers(win?: BrowserWindow): string[] {
  // Drain any existing event listener subscriptions from a previous registration.
  // ipcMain.removeHandler (below) already prevents duplicate IPC handlers,
  // but onSessionUpdate/onStreamChunk listeners would accumulate without this.
  if (cleanupFns.length > 0) {
    for (const fn of cleanupFns) fn()
    cleanupFns.length = 0
  }

  const channels: string[] = []
  const svc = getService()

  function register(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel) // Prevent duplicate registration on window recreation
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return await handler(...args)
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
    channels.push(channel)
  }

  register(AGENT_CHAT_INVOKE_CHANNELS.createThread, (request: unknown) => {
    const obj = requireValidObject(request, 'createThread request')
    requireValidString(obj.workspaceRoot, 'workspaceRoot')
    return svc.createThread(request as AgentChatCreateThreadRequest)
  })
  register(AGENT_CHAT_INVOKE_CHANNELS.deleteThread, (threadId: unknown) =>
    svc.deleteThread(requireValidString(threadId, 'threadId')))
  register(AGENT_CHAT_INVOKE_CHANNELS.loadThread, (threadId: unknown) =>
    svc.loadThread(requireValidString(threadId, 'threadId')))
  register(AGENT_CHAT_INVOKE_CHANNELS.listThreads, (workspaceRoot: unknown) =>
    // workspaceRoot is optional — pass through as-is (undefined is valid)
    svc.listThreads(workspaceRoot as string | undefined))
  register(AGENT_CHAT_INVOKE_CHANNELS.sendMessage, (request: unknown) => {
    const obj = requireValidObject(request, 'sendMessage request')
    // threadId is intentionally optional — omitted when starting a new chat
    requireValidString(obj.content, 'content')
    return svc.sendMessage(request as AgentChatSendMessageRequest)
  })
  register(AGENT_CHAT_INVOKE_CHANNELS.resumeLatestThread, (workspaceRoot: unknown) =>
    svc.resumeLatestThread(requireValidString(workspaceRoot, 'workspaceRoot')))
  register(AGENT_CHAT_INVOKE_CHANNELS.getLinkedDetails, (link: unknown) => {
    requireValidObject(link, 'getLinkedDetails link')
    return svc.getLinkedDetails(link as AgentChatOrchestrationLink)
  })
  register(AGENT_CHAT_INVOKE_CHANNELS.branchThread, (threadId: unknown, fromMessageId: unknown) =>
    svc.branchThread(requireValidString(threadId, 'threadId'), requireValidString(fromMessageId, 'fromMessageId')))

  // agentChat:getBufferedChunks — returns buffered stream chunks for reconnection
  // after renderer refresh. The main process buffers chunks for active sends so
  // the renderer can replay them and restore in-flight streaming UI state.
  register(AGENT_CHAT_INVOKE_CHANNELS.getBufferedChunks, (threadId: unknown) =>
    svc.getBufferedChunks(requireValidString(threadId, 'threadId')))

  // agentChat:cancelTask — stops a running orchestration task by its taskId.
  // Unlike orchestration:cancelTask (which creates a fresh adapter with empty
  // process maps), this routes through the singleton orchestration that actually
  // owns the running processes — so it can find and kill them.
  register(AGENT_CHAT_INVOKE_CHANNELS.cancelTask, (taskId: unknown) =>
    getOrchestration().cancelTask(requireValidString(taskId, 'taskId')))

  // agentChat:revertToSnapshot — reverts file changes made during an agent turn
  register(AGENT_CHAT_INVOKE_CHANNELS.revertToSnapshot, (threadId: unknown, messageId: unknown) =>
    svc.revertToSnapshot(requireValidString(threadId, 'threadId'), requireValidString(messageId, 'messageId')))

  // agentChat:getLinkedTerminal — returns the PTY session ID for a chat thread
  register(AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, async (threadId: unknown) => {
    const result = await svc.loadThread(requireValidString(threadId, 'threadId'))
    if (!result.success || !result.thread) {
      return { success: false, error: result.error ?? 'Thread not found' }
    }
    const link = result.thread.latestOrchestration
    return {
      success: true,
      claudeSessionId: link?.claudeSessionId ?? null,
      linkedTerminalId: link?.linkedTerminalId ?? null,
    }
  })

  // Forward orchestration session events to renderer via agentChat thread channel
  if (win) {
    const safeSend = (channel: string | undefined, data: unknown) => {
      if (channel && !win.isDestroyed()) win.webContents.send(channel, data)
      if (channel) broadcastToWebClients(channel, data)
    }

    const orch = getOrchestration()
    cleanupFns.push(
      orch.onSessionUpdate((session) => {
        // The renderer expects AgentChatThreadRecord on the thread channel
        // and AgentChatThreadStatusSnapshot on the status channel.
        // TaskSessionRecord is a different shape — project it properly.
        void (async () => {
          try {
            // Find the chat thread linked to this orchestration session
            const threads = await svc.listThreads()
            const linkedThread = threads.threads?.find((t) =>
              t.latestOrchestration?.sessionId === session.id ||
              t.latestOrchestration?.taskId === session.taskId,
            )
            if (!linkedThread) return

            // While the bridge is actively streaming for this thread, suppress
            // thread update pushes to the renderer. The streaming UI is
            // authoritative during active sends — pushing persisted thread
            // snapshots mid-stream causes the renderer to switch from streaming
            // blocks to persisted blocks (which have different structure due to
            // mergeAdjacentTextBlocks), creating visual duplication.
            const activeThreadIds = svc.bridge.getActiveThreadIds()
            const isActivelyStreaming = activeThreadIds.includes(linkedThread.id)

            // Project the session update into the chat thread
            const projected = await projectAgentChatSession({
              session,
              thread: linkedThread,
              threadStore: agentChatThreadStore,
            })

            if (projected.changed && !isActivelyStreaming) {
              safeSend(AGENT_CHAT_EVENT_CHANNELS.thread, projected.thread)
            }

            // Also emit on the status channel so onStatusChange listeners fire
            const link = buildAgentChatOrchestrationLink(session)
            safeSend(AGENT_CHAT_EVENT_CHANNELS.status, {
              threadId: linkedThread.id,
              workspaceRoot: linkedThread.workspaceRoot,
              status: mapOrchestrationStatusToAgentChatStatus(session.status),
              latestMessageId: projected.latestMessageId,
              latestOrchestration: link,
              updatedAt: projected.thread.updatedAt,
            })
          } catch (error) {
            console.error('[agentChat] session-update projection failed:', error)
          }
        })()
      }),
    )

    // Forward stream chunks from the bridge to the renderer
    cleanupFns.push(
      svc.bridge.onStreamChunk((chunk) => {
        safeSend(AGENT_CHAT_EVENT_CHANNELS.stream, chunk)
      }),
    )
  }

  registeredChannels = channels
  return channels
}

export function cleanupAgentChatHandlers(): void {
  for (const fn of cleanupFns) fn()
  cleanupFns.length = 0
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel)
  }
  registeredChannels = []
  service = null
  orchestration = null
}
