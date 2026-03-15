import { describe, expect, it, vi } from 'vitest'

vi.mock('./providers/claudeCodeAdapter', () => ({
  createClaudeCodeAdapter: () => ({
    provider: 'claude-code',
    getCapabilities: () => ({
      provider: 'claude-code',
      supportsStreaming: true,
      supportsResume: true,
      supportsStructuredEdits: false,
      supportsToolUse: true,
      supportsContextCaching: false,
      maxContextHint: null,
      requiresTerminalSession: true,
      requiresHookEvents: true,
    }),
    submitTask: async () => {
      throw new Error('unused in test')
    },
    resumeTask: async () => {
      throw new Error('unused in test')
    },
    cancelTask: async () => undefined,
  }),
}))

vi.mock('./providers/codexAdapter', () => ({
  createCodexAdapter: () => ({
    provider: 'codex',
    getCapabilities: () => ({
      provider: 'codex',
      supportsStreaming: false,
      supportsResume: false,
      supportsStructuredEdits: false,
      supportsToolUse: false,
      supportsContextCaching: false,
      maxContextHint: null,
      requiresTerminalSession: false,
      requiresHookEvents: false,
    }),
    submitTask: async () => {
      throw new Error('unused in test')
    },
    resumeTask: async () => {
      throw new Error('unused in test')
    },
    cancelTask: async () => undefined,
  }),
}))

import { createAgentLoopController } from './agentLoopController'
import {
  StaticProviderAdapterRegistry,
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderAdapter,
} from './providers/providerAdapter'
import type { ContextPacket, DiffSummary, ProviderProgressEvent, VerificationSummary } from './types'

function createCodexCapabilities() {
  return {
    provider: 'codex' as const,
    supportsStreaming: false,
    supportsResume: false,
    supportsStructuredEdits: false,
    supportsToolUse: false,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  }
}

function createNow(seed: number): () => number {
  let tick = seed
  return () => ++tick
}

function createProviderLaunchResult(sessionId: string, submittedAt: number, lastMessage: string) {
  return {
    session: createProviderSessionReference('codex', { sessionId }),
    artifact: createProviderArtifact({
      provider: 'codex',
      status: 'completed',
      session: createProviderSessionReference('codex', { sessionId }),
      submittedAt,
      completedAt: submittedAt,
      lastMessage,
    }),
  }
}

function createBaseAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    provider: 'codex',
    getCapabilities: () => createCodexCapabilities(),
    submitTask: async () => {
      throw new Error('submit not configured')
    },
    resumeTask: async () => {
      throw new Error('resume not used')
    },
    cancelTask: async () => undefined,
    ...overrides,
  }
}

function createController(options: {
  adapter: ProviderAdapter
  diffSummarizer?: { summarize: ReturnType<typeof vi.fn> }
  nowSeed: number
  verificationRunner?: { run: ReturnType<typeof vi.fn> }
}) {
  return createAgentLoopController({
    now: createNow(options.nowSeed),
    contextPacketBuilder: {
      build: async () => createPacket(),
    },
    providerRegistry: new StaticProviderAdapterRegistry([options.adapter]),
    diffSummarizer: options.diffSummarizer,
    verificationRunner: options.verificationRunner as never,
  })
}

function createQueuedProgressEvent(sessionId: string): ProviderProgressEvent {
  return {
    provider: 'codex',
    status: 'queued',
    message: 'Queued by provider',
    timestamp: 110,
    session: createProviderSessionReference('codex', { sessionId }),
  }
}

function expectLaunchResult(started: Awaited<ReturnType<ReturnType<typeof createAgentLoopController>['startTask']>>, sessionId: string): void {
  expect(started.success).toBe(true)
  expect(started.session?.status).toBe('applying')
  expect(started.session?.contextPacket?.id).toBe('packet-1')
  expect(started.session?.providerSession).toEqual({ provider: 'codex', sessionId })
  expect(started.session?.attempts).toHaveLength(1)
  expect(started.session?.attempts[0]?.providerArtifact).toMatchObject({
    provider: 'codex',
    status: 'completed',
    session: { provider: 'codex', sessionId },
  })
  expect(started.state?.status).toBe('applying')
}

function createVerificationFixtures() {
  return {
    verificationRunner: {
      run: vi.fn()
        .mockResolvedValueOnce(createVerificationSummary('passed'))
        .mockResolvedValueOnce(createVerificationSummary('failed')),
    },
    diffSummarizer: {
      summarize: vi.fn()
        .mockResolvedValueOnce({ diff: createDiff(0), groups: [], riskyAreas: [] })
        .mockResolvedValueOnce({ diff: createDiff(1), groups: [], riskyAreas: ['src/index.ts'] }),
    },
  }
}

async function createAndStartTask(controller: ReturnType<typeof createAgentLoopController>, overrides: Partial<ReturnType<typeof createRequest>> = {}) {
  const request = { ...createRequest(), ...overrides }
  const created = await controller.createTask(request)
  await controller.startTask(request.taskId)
  return created
}

function registerProviderLaunchStateTest(): void {
  it('transitions through provider launch states and persists provider progress', async () => {
    const progressEvents: ProviderProgressEvent[] = []
    const stateStatuses: string[] = []
    const adapter = createBaseAdapter({
      submitTask: async (_context, sink) => {
        sink.emit(createQueuedProgressEvent('provider-session-1'))
        return createProviderLaunchResult('provider-session-1', 111, 'Provider accepted task')
      },
    })
    const controller = createController({ adapter, nowSeed: 100 })

    controller.onProviderEvent((event) => {
      progressEvents.push(event as ProviderProgressEvent)
    })
    controller.onStateChange((state) => {
      stateStatuses.push(state.status)
    })

    await controller.createTask(createRequest())
    const started = await controller.startTask('task-1')

    expectLaunchResult(started, 'provider-session-1')
    expect(stateStatuses).toEqual(['idle', 'selecting_context', 'awaiting_provider', 'applying'])
    expect(progressEvents).toEqual([createQueuedProgressEvent('provider-session-1')])
  })
}

function registerFinalizeStateTest(): void {
  it('finalizes clean runs as complete and changed or failed runs as needs_review', async () => {
    const fixtures = createVerificationFixtures()
    const submitTask = vi.fn(async () => createProviderLaunchResult('provider-session-2', 210, 'Submitted'))
    const adapter = createBaseAdapter({ submitTask })
    const controller = createController({
      adapter,
      diffSummarizer: fixtures.diffSummarizer,
      nowSeed: 200,
      verificationRunner: fixtures.verificationRunner,
    })
    const verificationEvents: VerificationSummary[] = []

    controller.onVerificationSummary((summary) => {
      verificationEvents.push(summary)
    })

    const firstCreated = await createAndStartTask(controller)
    const firstFinalize = await controller.finalizeTask(firstCreated.session!.id)
    expect(firstFinalize.result).toMatchObject({ status: 'complete', nextSuggestedAction: 'review_changes', diffSummary: createDiff(0) })
    expect(firstFinalize.session?.status).toBe('complete')
    expect(firstFinalize.state?.status).toBe('complete')

    const secondCreated = await createAndStartTask(controller, { taskId: 'task-2', sessionId: 'session-2' })
    const secondFinalize = await controller.finalizeTask(secondCreated.session!.id)
    expect(secondFinalize.result).toMatchObject({ status: 'needs_review', nextSuggestedAction: 'rerun_verification', unresolvedIssues: ['Build failed'] })
    expect(secondFinalize.session?.status).toBe('needs_review')
    expect(secondFinalize.state?.status).toBe('needs_review')
    expect(fixtures.diffSummarizer.summarize).toHaveBeenCalledTimes(2)
    expect(fixtures.verificationRunner.run).toHaveBeenCalledTimes(2)
    expect(verificationEvents.map((summary) => summary.status)).toEqual(['passed', 'failed'])
  })
}

function registerUnresolvedIssuePreservationTest(): void {
  it('preserves unresolved issues when pausing without a new verification summary', async () => {
    const adapter = createBaseAdapter()
    const controller = createController({ adapter, nowSeed: 300 })

    const created = await controller.createTask(createRequest())
    await controller.updateSession(created.session!.id, {
      status: 'awaiting_provider',
      unresolvedIssues: ['Provider connection dropped'],
      nextSuggestedAction: 'retry_task',
    })

    const paused = await controller.pauseTask('task-1')

    expect(paused.success).toBe(true)
    expect(paused.session?.status).toBe('paused')
    expect(paused.session?.unresolvedIssues).toEqual(['Provider connection dropped'])
    expect(paused.result?.unresolvedIssues).toEqual(['Provider connection dropped'])
  })
}

function createRequest() {
  return {
    sessionId: 'session-1',
    taskId: 'task-1',
    workspaceRoots: ['C:/workspace'],
    goal: 'Ship the orchestration flow',
    mode: 'edit' as const,
    provider: 'codex' as const,
    verificationProfile: 'default' as const,
  }
}

function createPacket(): ContextPacket {
  return {
    version: 1,
    id: 'packet-1',
    createdAt: 1,
    task: {
      taskId: 'task-1',
      goal: 'Ship the orchestration flow',
      mode: 'edit',
      provider: 'codex',
      verificationProfile: 'default',
    },
    repoFacts: {
      workspaceRoots: ['C:/workspace'],
      roots: [{ rootPath: 'C:/workspace', languages: ['typescript'], entryPoints: [], recentlyEditedFiles: [], indexedAt: 1 }],
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

function createDiff(totalFiles: number): DiffSummary {
  return {
    files: totalFiles === 0 ? [] : [{ filePath: 'src/index.ts', additions: 1, deletions: 0 }],
    totalFiles,
    totalAdditions: totalFiles,
    totalDeletions: 0,
    summary: totalFiles === 0 ? 'No changed files detected.' : '1 file changed',
  }
}

function createVerificationSummary(status: VerificationSummary['status']): VerificationSummary {
  return {
    profile: 'default',
    status,
    startedAt: 20,
    completedAt: 21,
    commandResults: [],
    issues: status === 'failed' ? [{ severity: 'error', message: 'Build failed', filePath: 'C:/workspace/.' }] : [],
    summary: status === 'failed' ? 'Default verification failed with 1 issue.' : 'Default verification passed with 0 issues.',
    requiredApproval: false,
  }
}

describe('agentLoopController', () => {
  registerProviderLaunchStateTest()
  registerFinalizeStateTest()
  registerUnresolvedIssuePreservationTest()
})
