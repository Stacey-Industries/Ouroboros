import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/temp',
  },
}))

import { createTaskSessionStore } from './taskSessionStore'
import type { TaskRequest, TaskResult } from './types'

const createdRoots: string[] = []

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-task-session-store-'))
  createdRoots.push(root)
  return root
}

function createRequest(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    sessionId: 'session-1',
    taskId: 'task-1',
    workspaceRoots: ['C:/workspace'],
    goal: 'Ship the orchestration flow',
    mode: 'edit',
    provider: 'codex',
    verificationProfile: 'default',
    metadata: {
      origin: 'panel',
      label: 'Ship flow',
      requestedAt: 10,
    },
    ...overrides,
  }
}

function createLatestResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-1',
    sessionId: 'session-1',
    attemptId: 'attempt-1',
    status: 'needs_review',
    contextPacketId: 'packet-1',
    unresolvedIssues: ['Fix verification issue'],
    nextSuggestedAction: 'rerun_verification',
    message: 'Verification found issues',
    ...overrides,
  }
}

function createContextPacket() {
  return {
    version: 1 as const,
    id: 'packet-1',
    createdAt: 1,
    task: {
      taskId: 'task-1',
      goal: 'Ship the orchestration flow',
      mode: 'edit' as const,
      provider: 'codex' as const,
      verificationProfile: 'default' as const,
    },
    repoFacts: {
      workspaceRoots: ['C:/workspace'],
      roots: [{ rootPath: 'C:/workspace', languages: [], entryPoints: [], recentlyEditedFiles: [], indexedAt: 1 }],
      gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 1 },
      diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: 1 },
      recentEdits: { files: [], generatedAt: 1 },
    },
    liveIdeState: {
      selectedFiles: [],
      openFiles: [],
      dirtyFiles: [],
      dirtyBuffers: [],
      collectedAt: 1,
    },
    files: [],
    omittedCandidates: [],
    budget: { estimatedBytes: 0, estimatedTokens: 0, droppedContentNotes: [] },
  }
}

function registerPersistenceTest(): void {
  it('persists sessions to disk and seeds attempt history from the latest result', async () => {
    const sessionsDir = await createTempRoot()
    let tick = 100
    const store = createTaskSessionStore({ sessionsDir, createId: () => `generated-${++tick}`, now: () => ++tick })
    const created = await store.createSession(createRequest(), { status: 'needs_review', latestResult: createLatestResult() })
    const loaded = await store.loadSession(created.id)
    const persistedFiles = await fs.readdir(sessionsDir)

    expect(persistedFiles).toHaveLength(1)
    expect(loaded).not.toBeNull()
    expect(loaded?.latestResult?.attemptId).toBe('attempt-1')
    expect(loaded?.attempts).toHaveLength(1)
    expect(loaded?.attempts[0]).toMatchObject({
      id: 'attempt-1',
      status: 'needs_review',
      contextPacketId: 'packet-1',
      unresolvedIssues: ['Fix verification issue'],
      nextSuggestedAction: 'rerun_verification',
      resultMessage: 'Verification found issues',
    })
    expect(loaded?.attempts[0]?.completedAt).toBeDefined()
  })
}

function registerResumeTest(): void {
  it('resumes non-terminal sessions with updated request metadata and blocks completed sessions', async () => {
    const sessionsDir = await createTempRoot()
    let tick = 200
    const store = createTaskSessionStore({ sessionsDir, now: () => ++tick })
    const paused = await store.createSession(createRequest(), {
      status: 'paused',
      contextPacket: createContextPacket(),
      nextSuggestedAction: 'resume_provider',
    })
    const resumed = await store.resumeSession(paused.id)

    expect(resumed).not.toBeNull()
    expect(resumed?.status).toBe('awaiting_provider')
    expect(resumed?.request.resumeFromSessionId).toBe(paused.id)
    expect(resumed?.request.metadata).toMatchObject({ origin: 'resume', label: 'Ship flow' })
    expect((resumed?.request.metadata?.requestedAt ?? 0)).toBeGreaterThan(paused.request.metadata?.requestedAt ?? 0)

    const complete = await store.createSession(createRequest({ sessionId: 'session-2', taskId: 'task-2' }), { status: 'complete' })
    await expect(store.resumeSession(complete.id)).resolves.toBeNull()
  })
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('taskSessionStore', () => {
  registerPersistenceTest()
  registerResumeTest()
})
