import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd(),
  },
}))

import { createAgentChatThreadStore } from './threadStore'
import { projectAgentChatSession } from './eventProjector'
import { hydrateLatestAgentChatThread } from './threadHydrator'
import type { AgentChatThreadRecord } from './types'
import type { ContextPacket, TaskSessionRecord, VerificationSummary } from '../orchestration/types'

const createdRoots: string[] = []

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-agent-chat-'))
  createdRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function createVerificationSummary(): VerificationSummary {
  return {
    profile: 'default',
    status: 'failed',
    startedAt: 20,
    completedAt: 30,
    commandResults: [],
    issues: [{ severity: 'error', message: 'Test command failed', filePath: 'src/index.ts' }],
    summary: 'Default verification failed with 1 issue.',
    requiredApproval: false,
  }
}

function createContextRepoFacts(): ContextPacket['repoFacts'] {
  return {
    workspaceRoots: ['c:/repo'],
    roots: [{ rootPath: 'c:/repo', languages: ['typescript'], entryPoints: [], recentlyEditedFiles: [], indexedAt: 10 }],
    gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 10 },
    diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: 10 },
    recentEdits: { files: [], generatedAt: 10 },
  }
}

function createContextLiveIdeState(): ContextPacket['liveIdeState'] {
  return {
    selectedFiles: [],
    openFiles: [],
    dirtyFiles: [],
    dirtyBuffers: [],
    collectedAt: 10,
  }
}

function createContextFiles(): ContextPacket['files'] {
  return [{
    filePath: 'c:/repo/src/index.ts',
    score: 1,
    confidence: 'high',
    reasons: [{ kind: 'user_selected', weight: 1, detail: 'Selected by user' }],
    snippets: [],
    truncationNotes: [],
  }]
}

function createContextPacket(): ContextPacket {
  return {
    version: 1,
    id: 'packet-1',
    createdAt: 10,
    task: {
      taskId: 'task-1',
      goal: 'Ship the flow',
      mode: 'edit',
      provider: 'codex',
      verificationProfile: 'default',
    },
    repoFacts: createContextRepoFacts(),
    liveIdeState: createContextLiveIdeState(),
    files: createContextFiles(),
    omittedCandidates: [{ filePath: 'c:/repo/src/unused.ts', reason: 'budget' }],
    budget: {
      estimatedBytes: 100,
      estimatedTokens: 50,
      droppedContentNotes: [],
    },
  }
}

function createSessionRequest(): TaskSessionRecord['request'] {
  return {
    workspaceRoots: ['c:/repo'],
    goal: 'Ship the flow',
    mode: 'edit',
    provider: 'codex',
    verificationProfile: 'default',
    metadata: { origin: 'panel', label: 'Ship the flow', requestedAt: 1 },
  }
}

function createLatestResult(verificationSummary: VerificationSummary): TaskSessionRecord['latestResult'] {
  return {
    taskId: 'task-1',
    sessionId: 'session-1',
    attemptId: 'attempt-1',
    status: 'needs_review',
    contextPacketId: 'packet-1',
    verificationSummary,
    unresolvedIssues: ['Review the verification failure'],
    nextSuggestedAction: 'review_changes',
    message: 'Review the proposed changes before finalizing.',
  }
}

function createAttempt(verificationSummary: VerificationSummary): TaskSessionRecord['attempts'][0] {
  return {
    id: 'attempt-1',
    startedAt: 2,
    completedAt: 40,
    status: 'needs_review',
    contextPacketId: 'packet-1',
    verificationSummary,
    unresolvedIssues: ['Review the verification failure'],
    nextSuggestedAction: 'review_changes',
    resultMessage: 'Review the proposed changes before finalizing.',
  }
}

function createSession(): TaskSessionRecord {
  const verificationSummary = createVerificationSummary()

  return {
    version: 1,
    id: 'session-1',
    taskId: 'task-1',
    workspaceRoots: ['c:/repo'],
    createdAt: 1,
    updatedAt: 40,
    request: createSessionRequest(),
    status: 'needs_review',
    contextPacket: createContextPacket(),
    providerSession: { provider: 'codex', sessionId: 'provider-session-1' },
    lastVerificationSummary: verificationSummary,
    latestResult: createLatestResult(verificationSummary),
    attempts: [createAttempt(verificationSummary)],
    unresolvedIssues: ['Review the verification failure'],
    nextSuggestedAction: 'review_changes',
  }
}

async function createThread(storeDir: string): Promise<{
  store: ReturnType<typeof createAgentChatThreadStore>
  thread: AgentChatThreadRecord
}> {
  const store = createAgentChatThreadStore({
    threadsDir: storeDir,
    createId: () => 'thread-1',
    now: () => 5,
  })

  const thread = await store.createThread({
    workspaceRoot: 'c:/repo',
    title: 'Ship the flow',
  }, {
    status: 'submitting',
    latestOrchestration: { taskId: 'task-1', sessionId: 'session-1', attemptId: 'attempt-1' },
    messages: [{
      id: 'user-message-1',
      threadId: 'placeholder',
      role: 'user',
      content: 'Ship the flow',
      createdAt: 5,
      orchestration: { taskId: 'task-1', sessionId: 'session-1', attemptId: 'attempt-1' },
    }],
  })

  return { store, thread }
}

async function runProjection(store: ReturnType<typeof createAgentChatThreadStore>, thread: AgentChatThreadRecord) {
  const session = createSession()
  const firstProjection = await projectAgentChatSession({
    session,
    thread,
    threadStore: store,
  })
  const secondProjection = await projectAgentChatSession({
    session,
    thread: firstProjection.thread,
    threadStore: store,
  })
  return { firstProjection, secondProjection }
}

function expectProjectedThread(thread: AgentChatThreadRecord): void {
  expect(thread.status).toBe('needs_review')
  expect(thread.messages.map((message) => message.id)).toEqual([
    'user-message-1',
    'agent-chat:session-1:context',
    'agent-chat:session-1:verification',
    'agent-chat:session-1:result',
  ])
}

describe('agent chat event projector', () => {
  it('projects orchestration session summaries into stable chat messages without duplicating them', async () => {
    const root = await createTempRoot()
    const { store, thread } = await createThread(root)
    const { firstProjection, secondProjection } = await runProjection(store, thread)
    expect(firstProjection.changed).toBe(true)
    expectProjectedThread(firstProjection.thread)

    const storedAfterFirstProjection = await store.loadThread(thread.id)
    expect(storedAfterFirstProjection?.messages).toHaveLength(4)

    expect(secondProjection.changed).toBe(false)
    expect(secondProjection.changedMessages).toHaveLength(0)
    expect(secondProjection.thread.messages).toHaveLength(4)
  })

  it('hydrates the latest workspace thread from its linked orchestration session', async () => {
    const root = await createTempRoot()
    const { store, thread } = await createThread(root)
    const session = createSession()
    const loadSession = vi.fn(async () => ({ success: true, session }))

    const hydrated = await hydrateLatestAgentChatThread({
      orchestration: { loadSession },
      threadStore: store,
      workspaceRoot: thread.workspaceRoot,
    })

    expect(loadSession).toHaveBeenCalledWith('session-1')
    expect(hydrated?.status).toBe('needs_review')
    expect(hydrated?.latestOrchestration).toEqual({
      taskId: 'task-1',
      sessionId: 'session-1',
      attemptId: 'attempt-1',
    })
    expect(hydrated?.messages.at(-1)?.content).toBe('Review the proposed changes before finalizing.')
  })
})
