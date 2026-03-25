import type { ContextPacket, TaskRequest, TaskSessionPatch, TaskSessionRecord } from './types'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function buildFallbackPacket(request: TaskRequest): ContextPacket {
  const selected = Array.from(new Set([
    ...(request.contextSelection?.userSelectedFiles ?? []),
    ...(request.contextSelection?.pinnedFiles ?? []),
    ...(request.contextSelection?.includedFiles ?? []),
  ]))
  return {
    version: 1,
    id: createId('packet'),
    createdAt: Date.now(),
    task: {
      taskId: request.taskId ?? createId('task'),
      goal: request.goal,
      mode: request.mode,
      provider: request.provider,
      verificationProfile: request.verificationProfile,
    },
    repoFacts: {
      workspaceRoots: request.workspaceRoots,
      roots: request.workspaceRoots.map((rootPath) => ({ rootPath, languages: [], entryPoints: [], recentlyEditedFiles: [], indexedAt: Date.now() })),
      gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: Date.now() },
      diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: Date.now() },
      recentEdits: { files: [], generatedAt: Date.now() },
    },
    liveIdeState: { selectedFiles: selected, openFiles: [], dirtyFiles: [], dirtyBuffers: [], collectedAt: Date.now() },
    files: selected.map((filePath) => ({ filePath, score: 100, confidence: 'high' as const, reasons: [{ kind: 'user_selected' as const, weight: 1, detail: 'Selected explicitly for orchestration.' }], snippets: [], truncationNotes: [] })),
    omittedCandidates: [],
    budget: { estimatedBytes: 0, estimatedTokens: 0, droppedContentNotes: [] },
  }
}

export function applyTaskSessionPatch(session: TaskSessionRecord, patch: TaskSessionPatch): TaskSessionRecord {
  return {
    ...session,
    updatedAt: Date.now(),
    status: patch.status ?? session.status,
    contextPacket: patch.contextPacket ?? session.contextPacket,
    providerSession: patch.providerSession ?? session.providerSession,
    lastVerificationSummary: patch.lastVerificationSummary ?? session.lastVerificationSummary,
    latestResult: patch.latestResult ?? session.latestResult,
    unresolvedIssues: patch.unresolvedIssues ?? session.unresolvedIssues,
    nextSuggestedAction: patch.nextSuggestedAction ?? session.nextSuggestedAction,
    attempts: patch.appendAttempt ? [...session.attempts, patch.appendAttempt] : session.attempts,
  }
}

export interface AgentLoopTaskSessionStore {
  getByTaskId: (taskId: string) => Promise<TaskSessionRecord | null>
  list: (workspaceRoot?: string) => Promise<TaskSessionRecord[]>
  load: (sessionId: string) => Promise<TaskSessionRecord | null>
  resume?: (sessionId: string) => Promise<TaskSessionRecord | null>
  save: (session: TaskSessionRecord) => Promise<TaskSessionRecord>
}

export class InMemoryTaskSessionStore implements AgentLoopTaskSessionStore {
  private readonly sessions = new Map<string, TaskSessionRecord>()

  async getByTaskId(taskId: string): Promise<TaskSessionRecord | null> {
    return (await this.list()).find((session) => session.taskId === taskId) ?? null
  }

  async list(workspaceRoot?: string): Promise<TaskSessionRecord[]> {
    return Array.from(this.sessions.values())
      .filter((session) => !workspaceRoot || session.workspaceRoots.includes(workspaceRoot))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }

  async load(sessionId: string): Promise<TaskSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null
  }

  async resume(sessionId: string): Promise<TaskSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null
  }

  async save(session: TaskSessionRecord): Promise<TaskSessionRecord> {
    this.sessions.set(session.id, session)
    return session
  }
}
