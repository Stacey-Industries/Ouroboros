/**
 * agentChat.ts — IPC handlers for agent chat.
 *
 * Wires the AgentChatService to ipcMain.handle() for all
 * agentChat invoke channels, and forwards events to the renderer.
 */

import { type BrowserWindow, ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { Worker } from 'worker_threads'

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
import { formatMemoriesForContext } from '../agentChat/memoryExtractor'
import { sessionMemoryStore, type SessionMemoryEntry } from '../agentChat/sessionMemory'
import { buildGraphSummary, formatGraphSummary, type GraphSummary } from '../orchestration/graphSummaryBuilder'
import type { RepoIndexSnapshot } from '../orchestration/repoIndexer'
import { createClaudeCodeAdapter } from '../orchestration/providers/claudeCodeAdapter'
import { createCodexAdapter } from '../orchestration/providers/codexAdapter'
import type { ProviderAdapter, ProviderProgressSink } from '../orchestration/providers/providerAdapter'
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
  /** Pre-built context packet — avoids rebuilding on every createTask. */
  cachedPacket?: ContextPacket
  /** The model the cached packet was built for. */
  cachedPacketModel?: string
}

const contextCache = new Map<string, CachedContext>()
const contextBuildInFlight = new Set<string>()
const CONTEXT_REFRESH_MS = 30_000  // refresh every 30s (runs in worker thread — no main-thread blocking)

function cacheKey(roots: string[]): string {
  return [...roots].sort().join('|')
}

// ── Disk persistence for context cache ────────────────────────────────

function getContextCachePath(): string {
  try {
    const { app } = require('electron')
    return path.join(app.getPath('userData'), 'context-cache.json')
  } catch {
    return ''
  }
}

/** Save the context cache to disk (best-effort, non-blocking). */
function persistContextCache(): void {
  const cachePath = getContextCachePath()
  if (!cachePath) return
  try {
    const entries: Array<[string, Omit<CachedContext, 'cachedPacket'> & { cachedPacket?: unknown }]> = []
    for (const [key, entry] of contextCache) {
      entries.push([key, { snapshot: entry.snapshot, graphSummary: entry.graphSummary, builtAt: entry.builtAt }])
    }
    const data = JSON.stringify(entries)
    fs.writeFile(cachePath, data, 'utf-8').catch(() => {})
  } catch { /* non-fatal */ }
}

/** Load persisted context cache from disk on startup. */
export function loadPersistedContextCache(): void {
  const cachePath = getContextCachePath()
  if (!cachePath) return
  try {
    const fsSync = require('fs')
    if (!fsSync.existsSync(cachePath)) return
    const data = fsSync.readFileSync(cachePath, 'utf-8')
    const entries: Array<[string, CachedContext]> = JSON.parse(data)
    for (const [key, entry] of entries) {
      // Mark as stale so background refresh triggers, but data is usable immediately
      contextCache.set(key, entry)
    }
    console.log(`[agentChat] Loaded persisted context cache (${entries.length} entries)`)
  } catch (err) {
    console.warn('[agentChat] Failed to load persisted context cache:', err)
  }
}

// ── Context worker management ─────────────────────────────────────────

let contextWorker: Worker | null = null
let workerReady = false

function getWorkerPath(): string {
  const outMainDir = __dirname.endsWith('chunks')
    ? path.dirname(__dirname)
    : __dirname
  return path.join(outMainDir, 'contextWorker.js')
}

function ensureContextWorker(): Worker | null {
  if (contextWorker) return contextWorker
  const workerPath = getWorkerPath()
  try {
    contextWorker = new Worker(workerPath)
    contextWorker.on('message', handleContextWorkerMessage)
    contextWorker.on('error', (err) => {
      console.warn('[agentChat] context worker error:', err)
      contextWorker = null
      workerReady = false
    })
    contextWorker.on('exit', (code) => {
      if (code !== 0) console.warn('[agentChat] context worker exited with code', code)
      contextWorker = null
      workerReady = false
    })
    return contextWorker
  } catch (err) {
    console.warn('[agentChat] Failed to create context worker:', err)
    return null
  }
}

function handleContextWorkerMessage(msg: { type: string; id?: string; snapshot?: RepoIndexSnapshot; packet?: ContextPacket; durationMs?: number; message?: string }): void {
  if (msg.type === 'ready') {
    workerReady = true
    console.log('[agentChat] context worker ready')
    return
  }
  if (msg.type === 'error') {
    console.warn('[agentChat] context worker error for', msg.id, ':', msg.message)
    contextBuildInFlight.delete(msg.id ?? '')
    return
  }
  if (msg.type === 'contextReady' && msg.id && msg.snapshot) {
    onContextReady(msg.id, msg.snapshot, msg.packet, msg.durationMs ?? 0)
  }
}

function onContextReady(id: string, snapshot: RepoIndexSnapshot, packet: ContextPacket | undefined, durationMs: number): void {
  const roots = id.split('|')
  const key = cacheKey(roots)

  const entry: CachedContext = {
    snapshot,
    graphSummary: { hotspots: [], blastRadius: [], builtAt: 0 },
    builtAt: Date.now(),
    cachedPacket: packet,
  }
  contextCache.set(key, entry)
  console.log('[agentChat] Context cache built via worker in', durationMs, 'ms for key:', key, packet ? '(with packet)' : '(no packet)')
  persistContextCache()

  // Attach graph summary asynchronously (needs main-thread graph controller)
  void buildGraphSummary(roots[0])
    .catch(() => ({ hotspots: [], blastRadius: [], builtAt: 0 }) as GraphSummary)
    .then((gs) => {
      entry.graphSummary = gs
      if (entry.cachedPacket) {
        const section = formatGraphSummary(gs)
        if (section) entry.cachedPacket.graphSummary = section
      }
    })
    .finally(() => { contextBuildInFlight.delete(key) })
}

/** Trigger a background build of repo snapshot in a worker thread. */
export function warmSnapshotCache(roots: string[]): void {
  if (!roots.length) return
  const key = cacheKey(roots)
  if (contextBuildInFlight.has(key)) return

  const worker = ensureContextWorker()
  if (!worker) return

  // Use the cache key as the message id so onContextReady can map back
  contextBuildInFlight.add(key)
  worker.postMessage({ type: 'buildContext', id: key, roots })
}

/** Terminate the context worker (call on app shutdown). */
export function terminateContextWorker(): void {
  if (contextWorker) {
    contextWorker.terminate().catch(() => {})
    contextWorker = null
    workerReady = false
  }
}

/**
 * Get cached context synchronously. Returns whatever is cached immediately.
 * Does NOT trigger background refreshes — that would flood the event loop
 * with fs.readdir callbacks during the send path, starving IPC for 15-20s.
 * Refreshes happen only on the periodic timer (see startContextRefreshTimer).
 */
function getCachedContext(roots: string[]): CachedContext | null {
  return contextCache.get(cacheKey(roots)) ?? null
}

/** Periodic background refresh — runs on a timer, never on the send path. */
let contextRefreshTimer: ReturnType<typeof setInterval> | null = null

export function startContextRefreshTimer(roots: string[]): void {
  if (contextRefreshTimer) return
  console.log('[agentChat] Starting context refresh timer for roots:', roots)
  console.log('[agentChat] Current cache size:', contextCache.size, 'keys:', [...contextCache.keys()])
  // Initial warm-up after a short delay (let startup finish first)
  setTimeout(() => {
    console.log('[agentChat] Initial warm-up triggered for roots:', roots)
    warmSnapshotCache(roots)
  }, 5_000)
  // Then refresh every 5 min (context is supplementary — Claude Code reads files natively)
  contextRefreshTimer = setInterval(() => warmSnapshotCache(roots), CONTEXT_REFRESH_MS)
}

export function stopContextRefreshTimer(): void {
  if (contextRefreshTimer) {
    clearInterval(contextRefreshTimer)
    contextRefreshTimer = null
  }
}

/**
 * Mark cached context as stale so the next getOrBuildContext call returns it
 * immediately (avoiding a cold-start wait) while triggering a background
 * refresh.  Setting builtAt to 0 makes the staleness check always true.
 */
export function invalidateSnapshotCache(roots?: string[]): void {
  if (roots) {
    const entry = contextCache.get(cacheKey(roots))
    if (entry) entry.builtAt = 0
  } else {
    for (const entry of contextCache.values()) entry.builtAt = 0
  }
}

/**
 * Provider registry — maps provider names to adapter factories.
 * When Codex or other providers are added, register them here.
 * The orchestration facade selects the right adapter based on request.provider.
 */
const providerRegistry = new Map<OrchestrationProvider, () => ProviderAdapter>([
  ['claude-code', () => createClaudeCodeAdapter()],
  ['codex', () => createCodexAdapter()],
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
      const ct0 = Date.now()
      const taskId = request.taskId ?? createId('task')
      const sessionId = request.sessionId ?? createId('session')

      // Use only the pre-built context packet from the background cache.
      // NEVER build a context packet on-demand here — buildContextPacket
      // does heavy file I/O that blocks the main process event loop for
      // 5-10 seconds, causing "not responding" hangs in the UI.
      // Claude Code handles its own context (CLAUDE.md, project scan) natively.
      let contextPacket: ContextPacket | undefined
      const ct1 = Date.now()
      const ctx = getCachedContext(request.workspaceRoots)
      console.log('[agentChat:timing:main] createTask.getCachedContext:', Date.now() - ct1, 'ms', ctx ? 'hit' : 'miss', ctx?.cachedPacket ? 'packet-cached' : 'no-packet')
      if (ctx?.cachedPacket) {
        contextPacket = ctx.cachedPacket
        if (!contextPacket.graphSummary) {
          const graphSection = formatGraphSummary(ctx.graphSummary)
          if (graphSection) contextPacket.graphSummary = graphSection
        }
      }

      // Inject session memories from prior sessions (best-effort, non-blocking).
      if (contextPacket && request.workspaceRoots.length > 0) {
        try {
          const contextFiles = contextPacket.files.map((f) => f.path)
          const memories = await sessionMemoryStore.getRelevantMemories(
            request.workspaceRoots[0], contextFiles,
          )
          if (memories.length > 0) {
            contextPacket.sessionMemories = formatMemoriesForContext(memories)
          }
        } catch { /* memory loading failure is non-fatal */ }
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
      console.log('[agentChat:timing:main] createTask total:', Date.now() - ct0, 'ms')
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

      // Emit a 'cancelled' provider event so the bridge's cancel handler fires.
      // Without this, the bridge never cleans up its activeSends entry and late
      // 'completed'/'failed' events from the dying process overwrite the cancelled status.
      providerListeners.forEach((listener) => listener({
        provider: session.request.provider || 'claude-code',
        status: 'cancelled',
        message: 'Task cancelled by user',
        timestamp: Date.now(),
        session: session.providerSession,
      }))

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

  // ── Memory CRUD ────────────────────────────────────────────────────────────

  register(AGENT_CHAT_INVOKE_CHANNELS.listMemories, async (workspaceRoot: unknown) => {
    const root = requireValidString(workspaceRoot, 'workspaceRoot')
    return { success: true, memories: await sessionMemoryStore.loadMemories(root) }
  })

  register(AGENT_CHAT_INVOKE_CHANNELS.createMemory, async (workspaceRoot: unknown, entry: unknown) => {
    const root = requireValidString(workspaceRoot, 'workspaceRoot')
    const obj = requireValidObject(entry, 'memory entry')
    const newEntry = sessionMemoryStore.createEntry('manual', {
      type: (obj.type as SessionMemoryEntry['type']) || 'preference',
      content: requireValidString(obj.content, 'content'),
      relevantFiles: Array.isArray(obj.relevantFiles) ? obj.relevantFiles as string[] : [],
    })
    await sessionMemoryStore.saveMemories(root, [newEntry])
    return { success: true, memory: newEntry }
  })

  register(AGENT_CHAT_INVOKE_CHANNELS.updateMemory, async (workspaceRoot: unknown, memoryId: unknown, updates: unknown) => {
    const root = requireValidString(workspaceRoot, 'workspaceRoot')
    const id = requireValidString(memoryId, 'memoryId')
    const obj = requireValidObject(updates, 'updates')
    const updated = await sessionMemoryStore.updateEntry(root, id, obj as Partial<Pick<SessionMemoryEntry, 'content' | 'type' | 'relevantFiles'>>)
    if (!updated) return { success: false, error: 'Memory not found' }
    return { success: true, memory: updated }
  })

  register(AGENT_CHAT_INVOKE_CHANNELS.deleteMemory, async (workspaceRoot: unknown, memoryId: unknown) => {
    const root = requireValidString(workspaceRoot, 'workspaceRoot')
    const id = requireValidString(memoryId, 'memoryId')
    const deleted = await sessionMemoryStore.deleteEntry(root, id)
    if (!deleted) return { success: false, error: 'Memory not found' }
    return { success: true }
  })

  // agentChat:getLinkedTerminal — returns the PTY session ID for a chat thread
  register(AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, async (threadId: unknown) => {
    const result = await svc.loadThread(requireValidString(threadId, 'threadId'))
    if (!result.success || !result.thread) {
      return { success: false, error: result.error ?? 'Thread not found' }
    }
    const link = result.thread.latestOrchestration
    return {
      success: true,
      provider: link?.provider ?? null,
      claudeSessionId: link?.claudeSessionId ?? null,
      codexThreadId: link?.codexThreadId ?? null,
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
            // Find the chat thread linked to this orchestration session.
            // Use targeted bridge lookup + single-thread load instead of
            // loading ALL threads (which blocks the main event loop via
            // synchronous better-sqlite3 reads of every message row).
            const threadId = svc.bridge.findThreadIdForSession(session.id)
              ?? svc.bridge.findThreadIdForSession(session.taskId)
            if (!threadId) return
            const threadResult = await svc.loadThread(threadId)
            const linkedThread = threadResult.success ? threadResult.thread : undefined
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
