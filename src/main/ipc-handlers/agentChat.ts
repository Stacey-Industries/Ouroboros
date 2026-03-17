/**
 * agentChat.ts — IPC handlers for agent chat.
 *
 * Wires the AgentChatService to ipcMain.handle() for all
 * agentChat invoke channels, and forwards events to the renderer.
 */

import { type BrowserWindow, ipcMain } from 'electron'
import {
  createAgentChatService,
  type AgentChatService,
  AGENT_CHAT_INVOKE_CHANNELS,
  AGENT_CHAT_EVENT_CHANNELS,
} from '../agentChat'
import type {
  AgentChatCreateThreadRequest,
  AgentChatOrchestrationLink,
  AgentChatSendMessageRequest,
} from '../agentChat/types'
import { projectAgentChatSession } from '../agentChat/eventProjector'
import { agentChatThreadStore } from '../agentChat/threadStore'
import {
  buildAgentChatOrchestrationLink,
  mapOrchestrationStatusToAgentChatStatus,
} from '../agentChat/chatOrchestrationBridgeSupport'
import { createClaudeCodeAdapter } from '../orchestration/providers/claudeCodeAdapter'
import { buildContextPacket } from '../orchestration/contextPacketBuilder'
import { buildRepoIndexSnapshot } from '../orchestration/repoIndexer'
import type {
  ContextPacket,
  ProviderProgressEvent,
  TaskMutationResult,
  TaskRequest,
  TaskSessionRecord,
  TaskSessionResult,
} from '../orchestration/types'
import type { ProviderProgressSink } from '../orchestration/providers/providerAdapter'

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
const snapshotCache = new Map<string, { snapshot: RepoIndexSnapshot; builtAt: number }>()
const snapshotBuildInFlight = new Map<string, Promise<RepoIndexSnapshot | null>>()
const SNAPSHOT_MAX_AGE_MS = 60_000 // rebuild if older than 60s

function snapshotCacheKey(roots: string[]): string {
  return [...roots].sort().join('|')
}

/** Trigger a background snapshot build for the given workspace roots. */
export function warmSnapshotCache(roots: string[]): void {
  if (!roots.length) return
  const key = snapshotCacheKey(roots)
  if (snapshotBuildInFlight.has(key)) return // already building

  const buildPromise = (async (): Promise<RepoIndexSnapshot | null> => {
    try {
      const snapshot = await buildRepoIndexSnapshot(roots)
      snapshotCache.set(key, { snapshot, builtAt: Date.now() })
      return snapshot
    } catch (err) {
      console.warn('[agentChat] background snapshot build failed:', err)
      return null
    } finally {
      snapshotBuildInFlight.delete(key)
    }
  })()
  snapshotBuildInFlight.set(key, buildPromise)
}

/** Get a cached snapshot, or wait for an in-flight build (with timeout). */
async function getOrBuildSnapshot(roots: string[], timeoutMs = 15_000): Promise<RepoIndexSnapshot | null> {
  const key = snapshotCacheKey(roots)

  // Return cached if fresh enough
  const cached = snapshotCache.get(key)
  if (cached && Date.now() - cached.builtAt < SNAPSHOT_MAX_AGE_MS) {
    return cached.snapshot
  }

  // Wait for in-flight build, or start a new one
  if (!snapshotBuildInFlight.has(key)) {
    warmSnapshotCache(roots)
  }
  const pending = snapshotBuildInFlight.get(key)
  if (!pending) return null

  const result = await Promise.race([
    pending,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ])
  return result
}

/** Call from the outside to invalidate the cache (e.g. after git ops, file saves). */
export function invalidateSnapshotCache(roots?: string[]): void {
  if (roots) {
    snapshotCache.delete(snapshotCacheKey(roots))
  } else {
    snapshotCache.clear()
  }
}

function createMinimalOrchestration() {
  const adapter = createClaudeCodeAdapter()
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

      // Grab the pre-built snapshot (warmed on startup). If it's still
      // building, wait up to 15 s — but since it started when the IDE
      // opened, it's almost always ready by now.
      let contextPacket: ContextPacket | undefined
      const snapshot = await getOrBuildSnapshot(request.workspaceRoots)
      if (snapshot) {
        try {
          const result = await buildContextPacket({ request, repoFacts: snapshot.repoFacts, model: request.model, repoSnapshot: snapshot })
          contextPacket = result.packet
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
        await adapter.cancelTask(session.providerSession)
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

function getService(): AgentChatService {
  if (!service) {
    service = createAgentChatService({
      orchestration: getOrchestration(),
    })
  }
  return service
}

export function registerAgentChatHandlers(win?: BrowserWindow): string[] {
  const channels: string[] = []
  const svc = getService()

  function register(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args))
    channels.push(channel)
  }

  register(AGENT_CHAT_INVOKE_CHANNELS.createThread, (request: unknown) =>
    svc.createThread(request as AgentChatCreateThreadRequest))
  register(AGENT_CHAT_INVOKE_CHANNELS.deleteThread, (threadId: unknown) =>
    svc.deleteThread(threadId as string))
  register(AGENT_CHAT_INVOKE_CHANNELS.loadThread, (threadId: unknown) =>
    svc.loadThread(threadId as string))
  register(AGENT_CHAT_INVOKE_CHANNELS.listThreads, (workspaceRoot: unknown) =>
    svc.listThreads(workspaceRoot as string | undefined))
  register(AGENT_CHAT_INVOKE_CHANNELS.sendMessage, (request: unknown) =>
    svc.sendMessage(request as AgentChatSendMessageRequest))
  register(AGENT_CHAT_INVOKE_CHANNELS.resumeLatestThread, (workspaceRoot: unknown) =>
    svc.resumeLatestThread(workspaceRoot as string))
  register(AGENT_CHAT_INVOKE_CHANNELS.getLinkedDetails, (link: unknown) =>
    svc.getLinkedDetails(link as AgentChatOrchestrationLink))
  register(AGENT_CHAT_INVOKE_CHANNELS.branchThread, (threadId: unknown, fromMessageId: unknown) =>
    svc.branchThread(threadId as string, fromMessageId as string))

  // agentChat:getBufferedChunks — returns buffered stream chunks for reconnection
  // after renderer refresh. The main process buffers chunks for active sends so
  // the renderer can replay them and restore in-flight streaming UI state.
  register(AGENT_CHAT_INVOKE_CHANNELS.getBufferedChunks, (threadId: unknown) =>
    svc.getBufferedChunks(threadId as string))

  // agentChat:cancelTask — stops a running orchestration task by its taskId.
  // Unlike orchestration:cancelTask (which creates a fresh adapter with empty
  // process maps), this routes through the singleton orchestration that actually
  // owns the running processes — so it can find and kill them.
  register(AGENT_CHAT_INVOKE_CHANNELS.cancelTask, (taskId: unknown) =>
    getOrchestration().cancelTask(taskId as string))

  // agentChat:revertToSnapshot — reverts file changes made during an agent turn
  register(AGENT_CHAT_INVOKE_CHANNELS.revertToSnapshot, (threadId: unknown, messageId: unknown) =>
    svc.revertToSnapshot(threadId as string, messageId as string))

  // agentChat:getLinkedTerminal — returns the PTY session ID for a chat thread
  register(AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, async (threadId: unknown) => {
    const result = await svc.loadThread(threadId as string)
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

            // Project the session update into the chat thread
            const projected = await projectAgentChatSession({
              session,
              thread: linkedThread,
              threadStore: agentChatThreadStore,
            })

            if (projected.changed) {
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

  return channels
}

export function cleanupAgentChatHandlers(): void {
  for (const fn of cleanupFns) fn()
  cleanupFns.length = 0
  service = null
  orchestration = null
}
