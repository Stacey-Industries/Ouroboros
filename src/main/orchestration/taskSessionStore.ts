import { createHash, randomUUID } from 'crypto'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import type {
  ContextPacket,
  NextSuggestedAction,
  OrchestrationState,
  OrchestrationStatus,
  ProviderSessionReference,
  TaskAttemptRecord,
  TaskRequest,
  TaskResult,
  TaskSessionPatch,
  TaskSessionRecord,
  VerificationSummary,
} from './types'

export const DEFAULT_TASK_SESSION_STORE_DIR = path.join(app.getPath('userData'), 'orchestration', 'task-sessions')

const DEFAULT_MAX_TASK_SESSIONS = 100

export interface CreateTaskSessionOptions {
  status?: OrchestrationStatus
  contextPacket?: ContextPacket
  providerSession?: ProviderSessionReference
  lastVerificationSummary?: VerificationSummary
  latestResult?: TaskResult
  attempts?: TaskAttemptRecord[]
  unresolvedIssues?: string[]
  nextSuggestedAction?: NextSuggestedAction
}

export interface TaskSessionStoreOptions {
  createId?: () => string
  maxSessions?: number
  now?: () => number
  sessionsDir?: string
}

export interface TaskSessionStore {
  createSession: (request: TaskRequest, options?: CreateTaskSessionOptions) => Promise<TaskSessionRecord>
  updateSession: (sessionId: string, patch: TaskSessionPatch) => Promise<TaskSessionRecord>
  loadSession: (sessionId: string) => Promise<TaskSessionRecord | null>
  loadSessions: (workspaceRoot?: string) => Promise<TaskSessionRecord[]>
  loadLatestSession: (workspaceRoot?: string) => Promise<TaskSessionRecord | null>
  appendAttempt: (sessionId: string, attempt: TaskAttemptRecord) => Promise<TaskSessionRecord>
  appendResult: (sessionId: string, result: TaskResult) => Promise<TaskSessionRecord>
  resumeSession: (sessionId: string) => Promise<TaskSessionRecord | null>
  buildState: (session: TaskSessionRecord) => OrchestrationState
  getStorageDirectory: () => string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNonEmptyString)
}

function isActiveAttemptStatus(status: OrchestrationStatus): boolean {
  return status === 'idle'
    || status === 'selecting_context'
    || status === 'awaiting_provider'
    || status === 'applying'
    || status === 'verifying'
}

function shouldStampCompletedAt(status: OrchestrationStatus): boolean {
  return !isActiveAttemptStatus(status)
}

function hashSessionId(sessionId: string): string {
  return createHash('sha1').update(sessionId).digest('hex')
}

function sortAttempts(attempts: TaskAttemptRecord[]): TaskAttemptRecord[] {
  return [...attempts].sort((left, right) => {
    if (left.startedAt !== right.startedAt) return left.startedAt - right.startedAt
    return left.id.localeCompare(right.id)
  })
}

function normalizeTaskResult(result: TaskResult): TaskResult {
  return {
    ...result,
    unresolvedIssues: normalizeStringArray(result.unresolvedIssues),
  }
}

function normalizeAttempt(attempt: TaskAttemptRecord, now: () => number): TaskAttemptRecord {
  return {
    ...attempt,
    unresolvedIssues: normalizeStringArray(attempt.unresolvedIssues),
    completedAt: attempt.completedAt ?? (shouldStampCompletedAt(attempt.status) ? now() : undefined),
  }
}

function normalizeRequest(request: TaskRequest, taskId: string, sessionId: string, requestedAt: number): TaskRequest {
  const selection = request.contextSelection

  return {
    ...request,
    taskId,
    sessionId,
    workspaceRoots: normalizeStringArray(request.workspaceRoots),
    contextSelection: selection
      ? {
        userSelectedFiles: normalizeStringArray(selection.userSelectedFiles),
        pinnedFiles: normalizeStringArray(selection.pinnedFiles),
        includedFiles: normalizeStringArray(selection.includedFiles),
        excludedFiles: normalizeStringArray(selection.excludedFiles),
      }
      : undefined,
    metadata: request.metadata
      ? {
        ...request.metadata,
        requestedAt: request.metadata.requestedAt ?? requestedAt,
      }
      : undefined,
  }
}

function upsertAttempt(
  attempts: TaskAttemptRecord[],
  attempt: TaskAttemptRecord,
  now: () => number,
): TaskAttemptRecord[] {
  const normalizedAttempt = normalizeAttempt(attempt, now)
  const existingIndex = attempts.findIndex((entry) => entry.id === normalizedAttempt.id)

  if (existingIndex === -1) return sortAttempts([...attempts, normalizedAttempt])

  const nextAttempts = [...attempts]
  nextAttempts[existingIndex] = normalizeAttempt(
    {
      ...nextAttempts[existingIndex],
      ...normalizedAttempt,
      unresolvedIssues: normalizedAttempt.unresolvedIssues,
    },
    now,
  )

  return sortAttempts(nextAttempts)
}

function applyResultToAttempts(
  attempts: TaskAttemptRecord[],
  result: TaskResult,
  now: () => number,
): TaskAttemptRecord[] {
  if (!isNonEmptyString(result.attemptId)) return attempts

  const nextAttempt: TaskAttemptRecord = {
    id: result.attemptId,
    startedAt: now(),
    completedAt: shouldStampCompletedAt(result.status) ? now() : undefined,
    status: result.status,
    contextPacketId: result.contextPacketId,
    providerArtifact: result.providerArtifact,
    verificationSummary: result.verificationSummary,
    diffSummary: result.diffSummary,
    unresolvedIssues: normalizeStringArray(result.unresolvedIssues),
    nextSuggestedAction: result.nextSuggestedAction,
    resultMessage: result.message,
  }

  const existingIndex = attempts.findIndex((entry) => entry.id === result.attemptId)
  if (existingIndex === -1) return sortAttempts([...attempts, nextAttempt])

  const existingAttempt = attempts[existingIndex]
  const mergedAttempt: TaskAttemptRecord = {
    ...existingAttempt,
    status: result.status,
    contextPacketId: result.contextPacketId ?? existingAttempt.contextPacketId,
    providerArtifact: result.providerArtifact ?? existingAttempt.providerArtifact,
    verificationSummary: result.verificationSummary ?? existingAttempt.verificationSummary,
    diffSummary: result.diffSummary ?? existingAttempt.diffSummary,
    unresolvedIssues: normalizeStringArray(result.unresolvedIssues),
    nextSuggestedAction: result.nextSuggestedAction,
    resultMessage: result.message,
    completedAt: existingAttempt.completedAt ?? (shouldStampCompletedAt(result.status) ? now() : undefined),
  }

  const nextAttempts = [...attempts]
  nextAttempts[existingIndex] = normalizeAttempt(mergedAttempt, now)
  return sortAttempts(nextAttempts)
}

function buildAttemptTimeline(
  attempts: TaskAttemptRecord[],
  latestResult: TaskResult | undefined,
  now: () => number,
): TaskAttemptRecord[] {
  const normalizedAttempts = sortAttempts(attempts.map((attempt) => normalizeAttempt(attempt, now)))
  return latestResult ? applyResultToAttempts(normalizedAttempts, latestResult, now) : normalizedAttempts
}

function normalizeSessionRecord(session: TaskSessionRecord, now: () => number): TaskSessionRecord {
  const createdAt = Number.isFinite(session.createdAt) ? session.createdAt : now()
  const updatedAt = Number.isFinite(session.updatedAt) ? session.updatedAt : createdAt
  const taskId = isNonEmptyString(session.taskId) ? session.taskId : randomUUID()
  const sessionId = isNonEmptyString(session.id) ? session.id : randomUUID()
  const latestResult = session.latestResult ? normalizeTaskResult(session.latestResult) : undefined

  return {
    version: 1,
    id: sessionId,
    taskId,
    workspaceRoots: normalizeStringArray(session.workspaceRoots),
    createdAt,
    updatedAt,
    request: normalizeRequest(session.request, taskId, sessionId, createdAt),
    status: session.status,
    contextPacket: session.contextPacket,
    providerSession: session.providerSession,
    lastVerificationSummary: session.lastVerificationSummary,
    latestResult,
    attempts: buildAttemptTimeline(session.attempts ?? [], latestResult, now),
    unresolvedIssues: normalizeStringArray(session.unresolvedIssues ?? latestResult?.unresolvedIssues),
    nextSuggestedAction: session.nextSuggestedAction ?? latestResult?.nextSuggestedAction,
  }
}

function buildResumedStatus(session: TaskSessionRecord): OrchestrationStatus {
  if (session.status !== 'paused') {
    if (session.status === 'failed' && session.nextSuggestedAction === 'retry_task') return 'selecting_context'
    if (session.status === 'needs_review') return 'needs_review'
    if (session.status !== 'complete' && session.status !== 'cancelled') return session.status
  }

  if (session.nextSuggestedAction === 'resume_provider') return 'awaiting_provider'
  if (session.nextSuggestedAction === 'review_changes') return 'needs_review'
  if (session.nextSuggestedAction === 'rerun_verification') return 'verifying'
  if (session.nextSuggestedAction === 'adjust_context' || session.nextSuggestedAction === 'retry_task') return 'selecting_context'

  const latestAttempt = session.attempts[session.attempts.length - 1]
  if (latestAttempt && isActiveAttemptStatus(latestAttempt.status)) return latestAttempt.status

  const verificationStatus = session.lastVerificationSummary?.status
  if (verificationStatus === 'pending' || verificationStatus === 'running') return 'verifying'
  if (session.providerSession) return 'awaiting_provider'
  if (session.contextPacket) return 'awaiting_provider'

  return 'selecting_context'
}

export function buildOrchestrationStateFromSession(session: TaskSessionRecord): OrchestrationState {
  const latestAttempt = session.attempts[session.attempts.length - 1]
  const latestVerification = session.lastVerificationSummary ?? latestAttempt?.verificationSummary

  return {
    status: session.status,
    activeTaskId: session.taskId,
    activeSessionId: session.id,
    activeAttemptId: latestAttempt?.id,
    provider: session.providerSession?.provider ?? session.request.provider,
    verificationProfile: latestVerification?.profile ?? session.request.verificationProfile,
    contextPacketId: session.contextPacket?.id ?? latestAttempt?.contextPacketId ?? session.latestResult?.contextPacketId,
    message: session.latestResult?.message ?? latestAttempt?.resultMessage,
    pendingApproval: latestVerification?.requiredApproval,
    updatedAt: session.updatedAt,
  }
}

export function createTaskSessionStore(options: TaskSessionStoreOptions = {}): TaskSessionStore {
  const sessionsDir = options.sessionsDir ?? DEFAULT_TASK_SESSION_STORE_DIR
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_TASK_SESSIONS
  const now = options.now ?? Date.now
  const createId = options.createId ?? randomUUID
  let mutationQueue: Promise<void> = Promise.resolve()

  async function ensureSessionsDir(): Promise<void> {
    await fs.mkdir(sessionsDir, { recursive: true })
  }

  function getSessionFilePath(sessionId: string): string {
    return path.join(sessionsDir, `${hashSessionId(sessionId)}.json`)
  }

  async function fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async function readSessionFile(filePath: string): Promise<TaskSessionRecord | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as TaskSessionRecord
      return normalizeSessionRecord(parsed, now)
    } catch {
      return null
    }
  }

  async function loadAllSessions(): Promise<TaskSessionRecord[]> {
    await ensureSessionsDir()
    const entries = await fs.readdir(sessionsDir)
    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => readSessionFile(path.join(sessionsDir, entry))),
    )

    return sessions
      .filter((session): session is TaskSessionRecord => session !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }

  async function pruneOldSessions(): Promise<void> {
    if (maxSessions <= 0) return

    const sessions = await loadAllSessions()
    if (sessions.length <= maxSessions) return

    const staleSessions = sessions.slice(maxSessions)
    await Promise.all(staleSessions.map((session) => fs.unlink(getSessionFilePath(session.id)).catch(() => undefined)))
  }

  async function writeSession(session: TaskSessionRecord): Promise<TaskSessionRecord> {
    const normalizedSession = normalizeSessionRecord(session, now)
    await ensureSessionsDir()
    await fs.writeFile(getSessionFilePath(normalizedSession.id), JSON.stringify(normalizedSession, null, 2), 'utf-8')
    await pruneOldSessions()
    return normalizedSession
  }

  async function requireSession(sessionId: string): Promise<TaskSessionRecord> {
    const session = await readSessionFile(getSessionFilePath(sessionId))
    if (!session) throw new Error(`Task session not found: ${sessionId}`)
    return session
  }

  function applyPatch(session: TaskSessionRecord, patch: TaskSessionPatch): TaskSessionRecord {
    const latestResult = patch.latestResult ? normalizeTaskResult(patch.latestResult) : undefined
    const nextAttemptList = patch.appendAttempt
      ? upsertAttempt(session.attempts, patch.appendAttempt, now)
      : [...session.attempts]
    const nextResultAttempts = latestResult
      ? applyResultToAttempts(nextAttemptList, latestResult, now)
      : nextAttemptList

    return normalizeSessionRecord(
      {
        ...session,
        updatedAt: now(),
        status: patch.status ?? latestResult?.status ?? session.status,
        contextPacket: patch.contextPacket ?? session.contextPacket,
        providerSession: patch.providerSession ?? latestResult?.providerArtifact?.session ?? session.providerSession,
        lastVerificationSummary: patch.lastVerificationSummary ?? latestResult?.verificationSummary ?? session.lastVerificationSummary,
        latestResult: latestResult ?? session.latestResult,
        attempts: nextResultAttempts,
        unresolvedIssues: patch.unresolvedIssues ?? latestResult?.unresolvedIssues ?? session.unresolvedIssues,
        nextSuggestedAction: patch.nextSuggestedAction ?? latestResult?.nextSuggestedAction ?? session.nextSuggestedAction,
      },
      now,
    )
  }

  function runMutation<T>(action: () => Promise<T>): Promise<T> {
    const nextOperation = mutationQueue.then(action, action)
    mutationQueue = nextOperation.then(() => undefined, () => undefined)
    return nextOperation
  }

  return {
    async createSession(request, createOptions = {}) {
      return runMutation(async () => {
        const requestedAt = now()
        const sessionId = isNonEmptyString(request.sessionId) ? request.sessionId : createId()
        const taskId = isNonEmptyString(request.taskId) ? request.taskId : createId()
        const filePath = getSessionFilePath(sessionId)

        if (await fileExists(filePath)) {
          throw new Error(`Task session already exists: ${sessionId}`)
        }

        const session = await writeSession({
          version: 1,
          id: sessionId,
          taskId,
          workspaceRoots: normalizeStringArray(request.workspaceRoots),
          createdAt: requestedAt,
          updatedAt: requestedAt,
          request: normalizeRequest(request, taskId, sessionId, requestedAt),
          status: createOptions.status ?? createOptions.latestResult?.status ?? 'idle',
          contextPacket: createOptions.contextPacket,
          providerSession: createOptions.providerSession ?? createOptions.latestResult?.providerArtifact?.session,
          lastVerificationSummary: createOptions.lastVerificationSummary ?? createOptions.latestResult?.verificationSummary,
          latestResult: createOptions.latestResult ? normalizeTaskResult(createOptions.latestResult) : undefined,
          attempts: buildAttemptTimeline(
            createOptions.attempts ?? [],
            createOptions.latestResult ? normalizeTaskResult(createOptions.latestResult) : undefined,
            now,
          ),
          unresolvedIssues: normalizeStringArray(
            createOptions.unresolvedIssues ?? createOptions.latestResult?.unresolvedIssues,
          ),
          nextSuggestedAction: createOptions.nextSuggestedAction ?? createOptions.latestResult?.nextSuggestedAction,
        })

        return session
      })
    },

    async updateSession(sessionId, patch) {
      return runMutation(async () => writeSession(applyPatch(await requireSession(sessionId), patch)))
    },

    async loadSession(sessionId) {
      return readSessionFile(getSessionFilePath(sessionId))
    },

    async loadSessions(workspaceRoot) {
      const sessions = await loadAllSessions()
      if (!isNonEmptyString(workspaceRoot)) return sessions
      return sessions.filter((session) => session.workspaceRoots.includes(workspaceRoot))
    },

    async loadLatestSession(workspaceRoot) {
      const sessions = await loadAllSessions()
      const filteredSessions = isNonEmptyString(workspaceRoot)
        ? sessions.filter((session) => session.workspaceRoots.includes(workspaceRoot))
        : sessions
      return filteredSessions[0] ?? null
    },

    async appendAttempt(sessionId, attempt) {
      return runMutation(async () => writeSession(applyPatch(await requireSession(sessionId), { appendAttempt: attempt })))
    },

    async appendResult(sessionId, result) {
      return runMutation(async () => writeSession(applyPatch(await requireSession(sessionId), { latestResult: result })))
    },

    async resumeSession(sessionId) {
      return runMutation(async () => {
        const session = await requireSession(sessionId)
        if (session.status === 'complete' || session.status === 'cancelled') return null

        const resumedAt = now()
        const resumedSession = await writeSession({
          ...session,
          updatedAt: resumedAt,
          status: buildResumedStatus(session),
          request: {
            ...normalizeRequest(session.request, session.taskId, session.id, session.createdAt),
            resumeFromSessionId: session.id,
            metadata: {
              origin: 'resume',
              label: session.request.metadata?.label,
              requestedAt: resumedAt,
            },
          },
        })

        return resumedSession
      })
    },

    buildState(session) {
      return buildOrchestrationStateFromSession(session)
    },

    getStorageDirectory() {
      return sessionsDir
    },
  }
}

export const taskSessionStore = createTaskSessionStore()
