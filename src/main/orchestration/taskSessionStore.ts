import { randomUUID } from 'crypto'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// Types above are used in the public interface (TaskSessionStore, CreateTaskSessionOptions)
import {
  applyPatch,
  buildAttemptTimeline,
  buildOrchestrationStateFromSession,
  buildResumedStatus,
  hashSessionId,
  isNonEmptyString,
  normalizeRequest,
  normalizeSessionRecord,
  normalizeStringArray,
  normalizeTaskResult,
} from './taskSessionStoreHelpers'
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

export { buildOrchestrationStateFromSession }

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

// ─── Session store I/O context ────────────────────────────────────────────────

interface StoreIO {
  getFilePath: (id: string) => string
  fileExists: (filePath: string) => Promise<boolean>
  readFile: (filePath: string) => Promise<TaskSessionRecord | null>
  loadAll: () => Promise<TaskSessionRecord[]>
  writeSession: (session: TaskSessionRecord) => Promise<TaskSessionRecord>
  requireSession: (id: string) => Promise<TaskSessionRecord>
}

async function storeFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch { return false }
}

function buildStoreIO(sessionsDir: string, maxSessions: number, now: () => number): StoreIO {
  function getFilePath(sessionId: string): string {
    return path.join(sessionsDir, `${hashSessionId(sessionId)}.json`)
  }

  async function ensureDir(): Promise<void> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sessionsDir is app userData path or test override
    await fs.mkdir(sessionsDir, { recursive: true })
  }

  async function readFile(filePath: string): Promise<TaskSessionRecord | null> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- hash-derived path; not user-controlled
      const raw = await fs.readFile(filePath, 'utf-8')
      return normalizeSessionRecord(JSON.parse(raw) as TaskSessionRecord, now)
    } catch { return null }
  }

  async function loadAll(): Promise<TaskSessionRecord[]> {
    await ensureDir()
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sessionsDir is app userData path or test override
    const entries = await fs.readdir(sessionsDir)
    const sessions = await Promise.all(
      entries.filter((e) => e.endsWith('.json')).map((e) => readFile(path.join(sessionsDir, e))),
    )
    return sessions.filter((s): s is TaskSessionRecord => s !== null).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async function writeSession(session: TaskSessionRecord): Promise<TaskSessionRecord> {
    const normalized = normalizeSessionRecord(session, now)
    await ensureDir()
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- hash-derived path; not user-controlled
    await fs.writeFile(getFilePath(normalized.id), JSON.stringify(normalized, null, 2), 'utf-8')
    if (maxSessions > 0) {
      const all = await loadAll()
      await Promise.all(all.slice(maxSessions).map((s) =>
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- hash-derived path; not user-controlled
        fs.unlink(getFilePath(s.id)).catch(() => undefined),
      ))
    }
    return normalized
  }

  async function requireSession(sessionId: string): Promise<TaskSessionRecord> {
    const session = await readFile(getFilePath(sessionId))
    if (!session) throw new Error(`Task session not found: ${sessionId}`)
    return session
  }

  return { getFilePath, fileExists: storeFileExists, readFile, loadAll, writeSession, requireSession }
}

// ─── Session creation helpers ─────────────────────────────────────────────────

interface NewSessionIds { sessionId: string; taskId: string; requestedAt: number }

function resolveNewSessionStatus(opts: CreateTaskSessionOptions, result: TaskResult | undefined): OrchestrationStatus {
  return opts.status ?? result?.status ?? 'idle'
}

function resolveNewSessionProviderSession(
  opts: CreateTaskSessionOptions,
  result: TaskResult | undefined,
): ProviderSessionReference | undefined {
  return opts.providerSession ?? result?.providerArtifact?.session
}

function buildNewSessionRecord(
  request: TaskRequest,
  createOptions: CreateTaskSessionOptions,
  ids: NewSessionIds,
  now: () => number,
): TaskSessionRecord {
  const { sessionId, taskId, requestedAt } = ids
  const normalizedResult = createOptions.latestResult ? normalizeTaskResult(createOptions.latestResult) : undefined
  return {
    version: 1, id: sessionId, taskId,
    workspaceRoots: normalizeStringArray(request.workspaceRoots),
    createdAt: requestedAt, updatedAt: requestedAt,
    request: normalizeRequest(request, taskId, sessionId, requestedAt),
    status: resolveNewSessionStatus(createOptions, normalizedResult),
    contextPacket: createOptions.contextPacket,
    providerSession: resolveNewSessionProviderSession(createOptions, normalizedResult),
    lastVerificationSummary: createOptions.lastVerificationSummary ?? normalizedResult?.verificationSummary,
    latestResult: normalizedResult,
    attempts: buildAttemptTimeline(createOptions.attempts ?? [], normalizedResult, now),
    unresolvedIssues: normalizeStringArray(createOptions.unresolvedIssues ?? normalizedResult?.unresolvedIssues),
    nextSuggestedAction: createOptions.nextSuggestedAction ?? normalizedResult?.nextSuggestedAction,
  }
}

// ─── Store method implementations ────────────────────────────────────────────

interface StoreContext {
  io: StoreIO
  now: () => number
  createId: () => string
  runMutation: <T>(action: () => Promise<T>) => Promise<T>
}

async function createSessionImpl(ctx: StoreContext, request: TaskRequest, createOptions: CreateTaskSessionOptions): Promise<TaskSessionRecord> {
  return ctx.runMutation(async () => {
    const requestedAt = ctx.now()
    const sessionId = isNonEmptyString(request.sessionId) ? request.sessionId : ctx.createId()
    const taskId = isNonEmptyString(request.taskId) ? request.taskId : ctx.createId()
    if (await ctx.io.fileExists(ctx.io.getFilePath(sessionId))) {
      throw new Error(`Task session already exists: ${sessionId}`)
    }
    return ctx.io.writeSession(buildNewSessionRecord(request, createOptions, { sessionId, taskId, requestedAt }, ctx.now))
  })
}

async function loadSessionsImpl(ctx: StoreContext, workspaceRoot?: string): Promise<TaskSessionRecord[]> {
  const sessions = await ctx.io.loadAll()
  if (!isNonEmptyString(workspaceRoot)) return sessions
  return sessions.filter((s) => s.workspaceRoots.includes(workspaceRoot))
}

async function resumeSessionImpl(ctx: StoreContext, sessionId: string): Promise<TaskSessionRecord | null> {
  return ctx.runMutation(async () => {
    const session = await ctx.io.requireSession(sessionId)
    if (session.status === 'complete' || session.status === 'cancelled') return null
    const resumedAt = ctx.now()
    return ctx.io.writeSession({
      ...session, updatedAt: resumedAt, status: buildResumedStatus(session),
      request: {
        ...normalizeRequest(session.request, session.taskId, session.id, session.createdAt),
        resumeFromSessionId: session.id,
        metadata: { origin: 'resume', label: session.request.metadata?.label, requestedAt: resumedAt },
      },
    })
  })
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createTaskSessionStore(options: TaskSessionStoreOptions = {}): TaskSessionStore {
  const sessionsDir = options.sessionsDir ?? DEFAULT_TASK_SESSION_STORE_DIR
  const now = options.now ?? Date.now
  const createId = options.createId ?? randomUUID
  const io = buildStoreIO(sessionsDir, options.maxSessions ?? DEFAULT_MAX_TASK_SESSIONS, now)
  let mutationQueue: Promise<void> = Promise.resolve()
  function runMutation<T>(action: () => Promise<T>): Promise<T> {
    const next = mutationQueue.then(action, action)
    mutationQueue = next.then(() => undefined, () => undefined)
    return next
  }
  const ctx: StoreContext = { io, now, createId, runMutation }
  return {
    createSession: (req, opts = {}) => createSessionImpl(ctx, req, opts),
    updateSession: (id, patch) => runMutation(async () => io.writeSession(applyPatch(await io.requireSession(id), patch, now))),
    loadSession: (id) => io.readFile(io.getFilePath(id)),
    loadSessions: (root) => loadSessionsImpl(ctx, root),
    loadLatestSession: async (root) => (await loadSessionsImpl(ctx, root))[0] ?? null,
    appendAttempt: (id, attempt) => runMutation(async () => io.writeSession(applyPatch(await io.requireSession(id), { appendAttempt: attempt }, now))),
    appendResult: (id, result) => runMutation(async () => io.writeSession(applyPatch(await io.requireSession(id), { latestResult: result }, now))),
    resumeSession: (id) => resumeSessionImpl(ctx, id),
    buildState: buildOrchestrationStateFromSession,
    getStorageDirectory: () => sessionsDir,
  }
}

export const taskSessionStore = createTaskSessionStore()
