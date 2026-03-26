import { BrowserWindow, ipcMain } from 'electron'

import { createAgentLoopController } from '../orchestration/agentLoopController'
import { buildContextPacket } from '../orchestration/contextPacketBuilder'
import {
  ORCHESTRATION_EVENT_CHANNELS,
  ORCHESTRATION_EVENT_TYPES,
  ORCHESTRATION_INVOKE_CHANNELS,
} from '../orchestration/events'
import { buildRepoFacts } from '../orchestration/repoIndexer'
import { taskSessionStore } from '../orchestration/taskSessionStore'
import type {
  ContextPacketResult,
  OperationResult,
  OrchestrationAPI,
  OrchestrationEvent,
  OrchestrationState,
  ProviderProgressEvent,
  TaskMutationResult,
  TaskRequest,
  TaskSessionPatch,
  TaskSessionRecord,
  TaskSessionResult,
  TaskSessionsResult,
  VerificationProfileName,
  VerificationResult,
  VerificationSummary,
} from '../orchestration/types'

type TaskAttemptRecord = TaskSessionRecord['attempts'][number]
type OrchestrationInvokeResult =
  | ContextPacketResult
  | TaskMutationResult
  | TaskSessionResult
  | TaskSessionsResult
  | VerificationResult

type InvokeHandler<TResult extends OrchestrationInvokeResult> = (...args: unknown[]) => Promise<TResult>

const controller = createAgentLoopController({
  contextPacketBuilder: {
    async build(request: TaskRequest) {
      const repoFacts = await buildRepoFacts(request.workspaceRoots)
      const { packet } = await buildContextPacket({ request, repoFacts })
      return packet
    },
  },
  sessionStore: {
    async getByTaskId(taskId: string) {
      const sessions = await taskSessionStore.loadSessions()
      return sessions.find((session) => session.taskId === taskId) ?? null
    },
    list(workspaceRoot?: string) {
      return taskSessionStore.loadSessions(workspaceRoot)
    },
    load(sessionId: string) {
      return taskSessionStore.loadSession(sessionId)
    },
    resume(sessionId: string) {
      return taskSessionStore.resumeSession(sessionId)
    },
    save(session: TaskSessionRecord) {
      return persistSessionRecord(session)
    },
  },
})

const orchestrationApi: OrchestrationAPI = {
  createTask: (request) => controller.createTask(request),
  startTask: (taskId) => controller.startTask(taskId),
  previewContext: (request) => controller.previewContext(request),
  buildContextPacket: (request) => controller.buildContextPacket(request),
  loadSession: (sessionId) => controller.loadSession(sessionId),
  loadSessions: (workspaceRoot) => controller.loadSessions(workspaceRoot),
  loadLatestSession: (workspaceRoot) => controller.loadLatestSession(workspaceRoot),
  updateSession: (sessionId, patch) => controller.updateSession(sessionId, patch),
  resumeTask: (sessionId) => controller.resumeTask(sessionId),
  rerunVerification: (sessionId, profile) => controller.rerunVerification(sessionId, profile),
  cancelTask: (taskId) => controller.cancelTask(taskId),
  pauseTask: (taskId) => controller.pauseTask(taskId),
  onStateChange: (callback) => controller.onStateChange(callback),
  onProviderEvent: (callback) => controller.onProviderEvent((event) => callback(event as ProviderProgressEvent)),
  onVerificationSummary: (callback) => controller.onVerificationSummary(callback),
  onSessionUpdate: (callback) => controller.onSessionUpdate(callback),
}

let currentState: OrchestrationState = { status: 'idle', updatedAt: Date.now() }
let orchestrationSubscriptions: Array<() => void> = []

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function broadcastEvent(event: OrchestrationEvent): void {
  broadcast(ORCHESTRATION_EVENT_CHANNELS.event, event)
}

function emitStateChange(state: OrchestrationState): void {
  currentState = state
  broadcast(ORCHESTRATION_EVENT_CHANNELS.state, state)
  if (!state.activeTaskId) {
    return
  }
  broadcastEvent({
    type: ORCHESTRATION_EVENT_TYPES.stateChanged,
    taskId: state.activeTaskId,
    sessionId: state.activeSessionId,
    timestamp: state.updatedAt,
    state,
  })
}

function emitProviderProgress(progress: ProviderProgressEvent): void {
  broadcast(ORCHESTRATION_EVENT_CHANNELS.provider, progress)
  if (!currentState.activeTaskId) {
    return
  }
  broadcastEvent({
    type: ORCHESTRATION_EVENT_TYPES.providerProgress,
    taskId: currentState.activeTaskId,
    sessionId: currentState.activeSessionId,
    timestamp: progress.timestamp,
    progress,
  })
}

function emitVerificationSummary(summary: VerificationSummary): void {
  broadcast(ORCHESTRATION_EVENT_CHANNELS.verification, summary)
  if (!currentState.activeTaskId) {
    return
  }
  broadcastEvent({
    type: ORCHESTRATION_EVENT_TYPES.verificationUpdated,
    taskId: currentState.activeTaskId,
    sessionId: currentState.activeSessionId,
    timestamp: summary.completedAt ?? summary.startedAt,
    summary,
  })
}

function emitSessionUpdate(session: TaskSessionRecord): void {
  currentState = taskSessionStore.buildState(session)
  broadcast(ORCHESTRATION_EVENT_CHANNELS.session, session)
  broadcastEvent({
    type: ORCHESTRATION_EVENT_TYPES.sessionUpdated,
    taskId: session.taskId,
    sessionId: session.id,
    timestamp: session.updatedAt,
    session,
  })
}

function emitTaskResult(result: TaskMutationResult): void {
  if (!result.result || !result.taskId) {
    return
  }
  broadcastEvent({
    type: ORCHESTRATION_EVENT_TYPES.taskResult,
    taskId: result.taskId,
    sessionId: result.session?.id ?? result.result.sessionId,
    timestamp: result.session?.updatedAt ?? Date.now(),
    result: result.result,
  })
}

function ensureOrchestrationSubscriptions(): void {
  if (orchestrationSubscriptions.length > 0) {
    return
  }
  orchestrationSubscriptions = [
    orchestrationApi.onStateChange((state) => emitStateChange(state)),
    orchestrationApi.onProviderEvent((event) => emitProviderProgress(event as ProviderProgressEvent)),
    orchestrationApi.onVerificationSummary((summary) => emitVerificationSummary(summary)),
    orchestrationApi.onSessionUpdate((session) => emitSessionUpdate(session)),
  ]
}

function findUpdatedAttempt(previous: TaskSessionRecord, next: TaskSessionRecord): TaskAttemptRecord | undefined {
  const previousAttempts = new Map(previous.attempts.map((attempt) => [attempt.id, JSON.stringify(attempt)]))
  for (let index = next.attempts.length - 1; index >= 0; index -= 1) {
    // eslint-disable-next-line security/detect-object-injection -- index is a numeric loop counter; safe array access
    const attempt = next.attempts[index]
    if (previousAttempts.get(attempt.id) !== JSON.stringify(attempt)) {
      return attempt
    }
  }
  return undefined
}

async function persistSessionRecord(session: TaskSessionRecord): Promise<TaskSessionRecord> {
  const existing = await taskSessionStore.loadSession(session.id)
  if (!existing) {
    return taskSessionStore.createSession(session.request, {
      status: session.status,
      contextPacket: session.contextPacket,
      providerSession: session.providerSession,
      lastVerificationSummary: session.lastVerificationSummary,
      latestResult: session.latestResult,
      attempts: session.attempts,
      unresolvedIssues: session.unresolvedIssues,
      nextSuggestedAction: session.nextSuggestedAction,
    })
  }

  const patch: TaskSessionPatch = {
    status: session.status,
    contextPacket: session.contextPacket,
    providerSession: session.providerSession,
    lastVerificationSummary: session.lastVerificationSummary,
    latestResult: session.latestResult,
    unresolvedIssues: session.unresolvedIssues,
    nextSuggestedAction: session.nextSuggestedAction,
  }
  const appendAttempt = findUpdatedAttempt(existing, session)
  if (appendAttempt) {
    patch.appendAttempt = appendAttempt
  }
  return taskSessionStore.updateSession(session.id, patch)
}

function syncStateFromResult(result: OrchestrationInvokeResult): void {
  if ('session' in result && result.session) {
    currentState = taskSessionStore.buildState(result.session)
  }
  if ('state' in result && result.state) {
    currentState = result.state
  }
  if ('result' in result && result.result) {
    emitTaskResult(result)
  }
}

function registerHandler<TResult extends OrchestrationInvokeResult>(
  channels: string[],
  channel: string,
  handler: InvokeHandler<TResult>,
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      const result = await handler(...args)
      syncStateFromResult(result)
      return result
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      } satisfies OperationResult
    }
  })
  channels.push(channel)
}

export function getOrchestrationApi(): OrchestrationAPI {
  return orchestrationApi
}

export function registerOrchestrationHandlers(): string[] {
  ensureOrchestrationSubscriptions()

  const channels: string[] = []

  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.createTask, (request) => orchestrationApi.createTask(request as TaskRequest))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.startTask, (taskId) => orchestrationApi.startTask(taskId as string))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.previewContext, (request) => orchestrationApi.previewContext(request as TaskRequest))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.buildContextPacket, (request) => orchestrationApi.buildContextPacket(request as TaskRequest))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.loadSession, (sessionId) => orchestrationApi.loadSession(sessionId as string))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.loadSessions, (workspaceRoot) => orchestrationApi.loadSessions(workspaceRoot as string | undefined))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.loadLatestSession, (workspaceRoot) => orchestrationApi.loadLatestSession(workspaceRoot as string | undefined))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.updateSession, (sessionId, patch) => orchestrationApi.updateSession(sessionId as string, patch as TaskSessionPatch))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.resumeTask, (sessionId) => orchestrationApi.resumeTask(sessionId as string))
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.rerunVerification, (sessionId, profile) => orchestrationApi.rerunVerification(sessionId as string, profile as VerificationProfileName | undefined))
  // cancelTask removed from ORCHESTRATION_INVOKE_CHANNELS — cancel routes through agentChat:cancelTask
  registerHandler(channels, ORCHESTRATION_INVOKE_CHANNELS.pauseTask, (taskId) => orchestrationApi.pauseTask(taskId as string))

  return channels
}

export function cleanupOrchestrationHandlers(): void {
  for (const unsubscribe of orchestrationSubscriptions) {
    unsubscribe()
  }
  orchestrationSubscriptions = []
  currentState = { status: 'idle', updatedAt: Date.now() }
}
