import { type AgentLoopTaskSessionStore,applyTaskSessionPatch, buildFallbackPacket, InMemoryTaskSessionStore } from './agentLoopControllerDefaults'
import { applyProviderFailureToSession, applyProviderProgressToSession } from './agentLoopControllerSupport'
import { createDiffSummarizer, type DiffSummarizer } from './diffSummarizer'
import { createAnthropicApiAdapter } from './providers/anthropicApiAdapter'
import { createClaudeCodeAdapter } from './providers/claudeCodeAdapter'
import { createCodexAdapter } from './providers/codexAdapter'
import { type ProviderAdapter, type ProviderAdapterRegistry, type ProviderLaunchResult, type ProviderProgressSink,StaticProviderAdapterRegistry } from './providers/providerAdapter'
import type { ContextPacket, ContextPacketResult, OrchestrationState, OrchestrationStatus, ProviderProgressEvent, TaskAttemptRecord, TaskMutationResult, TaskRequest, TaskResult, TaskSessionPatch, TaskSessionRecord, TaskSessionResult, TaskSessionsResult, VerificationProfileName, VerificationResult, VerificationSummary } from './types'
import { createVerificationRunner, type VerificationPolicy, type VerificationRunner } from './verificationRunner'

interface ContextPacketBuilder { build: (request: TaskRequest) => Promise<ContextPacket> }
type TaskSessionStore = AgentLoopTaskSessionStore
export interface AgentLoopControllerDeps { contextPacketBuilder?: ContextPacketBuilder; diffSummarizer?: DiffSummarizer; providerRegistry?: ProviderAdapterRegistry; sessionStore?: TaskSessionStore; verificationPolicy?: VerificationPolicy; verificationRunner?: VerificationRunner; now?: () => number }
interface FinishRequest { session: TaskSessionRecord; status: OrchestrationStatus; verificationSummary?: VerificationSummary; diffSummary?: TaskResult['diffSummary']; message?: string; nextSuggestedAction?: TaskResult['nextSuggestedAction'] }

function createId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

export class AgentLoopController {
  private readonly contextPacketBuilder
  private readonly diffSummarizer
  private readonly now
  private readonly providerRegistry
  private readonly sessionStore
  private readonly verificationPolicy
  private readonly verificationRunner
  private readonly providerListeners = new Set<(message: unknown) => void>()
  private readonly sessionListeners = new Set<(session: TaskSessionRecord) => void>()
  private readonly stateListeners = new Set<(state: OrchestrationState) => void>()
  private readonly verificationListeners = new Set<(summary: VerificationSummary) => void>()
  private state: OrchestrationState

  constructor(deps: AgentLoopControllerDeps = {}) {
    this.contextPacketBuilder = deps.contextPacketBuilder
    this.diffSummarizer = deps.diffSummarizer ?? createDiffSummarizer()
    this.now = deps.now ?? Date.now
    this.providerRegistry = deps.providerRegistry ?? new StaticProviderAdapterRegistry([createClaudeCodeAdapter(), createCodexAdapter(), createAnthropicApiAdapter()])
    this.sessionStore = deps.sessionStore ?? new InMemoryTaskSessionStore()
    this.verificationPolicy = deps.verificationPolicy
    this.verificationRunner = deps.verificationRunner ?? createVerificationRunner()
    this.state = { status: 'idle', updatedAt: this.now() }
  }

  onProviderEvent(callback: (message: unknown) => void): () => void { this.providerListeners.add(callback); return () => this.providerListeners.delete(callback) }
  onSessionUpdate(callback: (session: TaskSessionRecord) => void): () => void { this.sessionListeners.add(callback); return () => this.sessionListeners.delete(callback) }
  onStateChange(callback: (state: OrchestrationState) => void): () => void { this.stateListeners.add(callback); return () => this.stateListeners.delete(callback) }
  onVerificationSummary(callback: (summary: VerificationSummary) => void): () => void { this.verificationListeners.add(callback); return () => this.verificationListeners.delete(callback) }

  async buildContextPacket(request: TaskRequest): Promise<ContextPacketResult> { try { return { success: true, packet: await this.packetFor(request) } } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) } } }
  async previewContext(request: TaskRequest): Promise<ContextPacketResult> { return this.buildContextPacket(request) }
  async loadLatestSession(workspaceRoot?: string): Promise<TaskSessionResult> { const session = (await this.sessionStore.list(workspaceRoot))[0] ?? undefined; return { success: true, session } }
  async loadSession(sessionId: string): Promise<TaskSessionResult> { const session = await this.sessionStore.load(sessionId); return session ? { success: true, session } : { success: false, error: `Session ${sessionId} not found` } }
  async loadSessions(workspaceRoot?: string): Promise<TaskSessionsResult> { return { success: true, sessions: await this.sessionStore.list(workspaceRoot) } }
  async updateSession(sessionId: string, patch: TaskSessionPatch): Promise<TaskSessionResult> { const session = await this.sessionStore.load(sessionId); return session ? { success: true, session: await this.persist(applyTaskSessionPatch(session, patch)) } : { success: false, error: `Session ${sessionId} not found` } }

  async createTask(request: TaskRequest): Promise<TaskMutationResult> {
    const taskId = request.taskId ?? createId('task')
    const sessionId = request.sessionId ?? createId('session')
    const session: TaskSessionRecord = {
      version: 1,
      id: sessionId,
      taskId,
      workspaceRoots: request.workspaceRoots,
      createdAt: this.now(),
      updatedAt: this.now(),
      request: { ...request, taskId, sessionId },
      status: 'idle',
      attempts: [],
      unresolvedIssues: [],
    }
    await this.persist(session)
    this.setState({ status: 'idle', activeTaskId: taskId, activeSessionId: session.id, provider: request.provider, verificationProfile: request.verificationProfile, message: 'Task created.' })
    return { success: true, taskId, session, state: this.state }
  }

  async startTask(taskId: string): Promise<TaskMutationResult> { return this.runProviderPhase(taskId, false) }
  async resumeTask(sessionId: string): Promise<TaskMutationResult> {
    const session = this.sessionStore.resume
      ? await this.sessionStore.resume(sessionId)
      : await this.sessionStore.load(sessionId)
    if (!session) {
      return { success: false, error: `Session ${sessionId} cannot be resumed` }
    }
    return this.runProviderPhase(session.taskId, true, session)
  }
  async pauseTask(taskId: string): Promise<TaskMutationResult> { return this.setSimpleStatus(taskId, 'paused', 'Task paused.') }

  async cancelTask(taskId: string): Promise<TaskMutationResult> {
    const session = await this.sessionForTask(taskId)
    if (!session) return { success: false, error: `Task ${taskId} not found` }
    if (session.providerSession) {
      const adapter = this.providerRegistry.get(session.providerSession.provider)
      await adapter?.cancelTask(session.providerSession)
    }
    return this.finish({ session, status: 'cancelled', message: 'Task cancelled.', nextSuggestedAction: 'retry_task' })
  }

  async finalizeTask(sessionId: string, profile?: VerificationProfileName): Promise<TaskMutationResult> {
    const session = await this.sessionStore.load(sessionId)
    if (!session) return { success: false, error: `Session ${sessionId} not found` }
    this.setState({ status: 'verifying', activeTaskId: session.taskId, activeSessionId: session.id, verificationProfile: profile ?? session.request.verificationProfile, message: 'Running verification.' })
    const diff = await this.diffSummarizer.summarize({ workspaceRoots: session.workspaceRoots })
    const verification = await this.verificationRunner.run({ profile: profile ?? session.request.verificationProfile, workspaceRoots: session.workspaceRoots, touchedFiles: diff.diff.files.map((file) => file.filePath), policy: this.verificationPolicy })
    this.emit(this.verificationListeners, verification)
    return this.finish({
      session,
      status: verification.status === 'passed' && diff.diff.totalFiles === 0 ? 'complete' : 'needs_review',
      verificationSummary: verification,
      diffSummary: diff.diff,
      message: verification.summary,
      nextSuggestedAction: verification.status === 'passed' ? 'review_changes' : 'rerun_verification',
    })
  }

  async rerunVerification(sessionId: string, profile?: VerificationProfileName): Promise<VerificationResult> {
    const result = await this.finalizeTask(sessionId, profile)
    return result.success ? { success: true, summary: result.session?.lastVerificationSummary, session: result.session, state: result.state } : { success: false, error: result.error }
  }

  private async finish(request: FinishRequest): Promise<TaskMutationResult> {
    const { session, status, verificationSummary, diffSummary, message, nextSuggestedAction } = request
    const lastAttempt = session.attempts.at(-1)
    const unresolvedIssues = verificationSummary
      ? verificationSummary.issues.map((issue: VerificationSummary['issues'][number]) => issue.message)
      : [...session.unresolvedIssues]
    const updatedAttempt: TaskAttemptRecord | undefined = lastAttempt ? { ...lastAttempt, completedAt: this.now(), status, verificationSummary, diffSummary, unresolvedIssues, nextSuggestedAction, resultMessage: message } : undefined
    const latestResult: TaskResult = { taskId: session.taskId, sessionId: session.id, attemptId: updatedAttempt?.id, status, contextPacketId: session.contextPacket?.id, providerArtifact: updatedAttempt?.providerArtifact, verificationSummary, diffSummary, unresolvedIssues, nextSuggestedAction, message }
    const saved = await this.persist({ ...session, status, updatedAt: this.now(), attempts: updatedAttempt ? [...session.attempts.slice(0, -1), updatedAttempt] : session.attempts, lastVerificationSummary: verificationSummary, latestResult, unresolvedIssues, nextSuggestedAction })
    this.setState({ status, activeTaskId: saved.taskId, activeSessionId: saved.id, activeAttemptId: updatedAttempt?.id, provider: saved.request.provider, verificationProfile: saved.request.verificationProfile, contextPacketId: saved.contextPacket?.id, message })
    return { success: true, taskId: saved.taskId, session: saved, state: this.state, result: latestResult }
  }

  private async packetFor(request: TaskRequest): Promise<ContextPacket> { return this.contextPacketBuilder ? this.contextPacketBuilder.build(request) : buildFallbackPacket(request) }
  private emit<T>(listeners: Set<(value: T) => void>, value: T): void { listeners.forEach((listener) => listener(value)) }
  private async persist(session: TaskSessionRecord): Promise<TaskSessionRecord> { const saved = await this.sessionStore.save(session); this.emit(this.sessionListeners, saved); return saved }
  private async sessionForTask(taskId: string): Promise<TaskSessionRecord | null> { return this.sessionStore.getByTaskId(taskId) }
  private setState(patch: Partial<OrchestrationState>): void { this.state = { ...this.state, ...patch, updatedAt: this.now() }; this.emit(this.stateListeners, this.state) }
  private async setSimpleStatus(taskId: string, status: OrchestrationStatus, message: string): Promise<TaskMutationResult> { const session = await this.sessionForTask(taskId); return session ? this.finish({ session, status, verificationSummary: session.lastVerificationSummary, diffSummary: session.latestResult?.diffSummary, message, nextSuggestedAction: session.nextSuggestedAction }) : { success: false, error: `Task ${taskId} not found` } }

  private async beginProviderPhase(session: TaskSessionRecord, contextPacket: ContextPacket): Promise<{ attempt: TaskAttemptRecord; session: TaskSessionRecord }> {
    const attempt: TaskAttemptRecord = { id: createId('attempt'), startedAt: this.now(), status: 'awaiting_provider', contextPacketId: contextPacket.id, unresolvedIssues: [] }
    const saved = await this.persist({
      ...session,
      status: 'awaiting_provider',
      updatedAt: this.now(),
      contextPacket,
      attempts: [...session.attempts, attempt],
      unresolvedIssues: [],
      nextSuggestedAction: 'resume_provider',
    })
    this.setProviderPhaseState({ contextPacket, attemptId: attempt.id, message: 'Preparing provider context.', session: saved, status: 'selecting_context' })
    return { attempt, session: saved }
  }

  private setProviderPhaseState(args: {
    contextPacket: ContextPacket
    attemptId: string
    message: string | undefined
    session: TaskSessionRecord
    status: OrchestrationStatus
  }): void {
    this.setState({ status: args.status, activeTaskId: args.session.taskId, activeSessionId: args.session.id, activeAttemptId: args.attemptId, provider: args.session.request.provider, verificationProfile: args.session.request.verificationProfile, contextPacketId: args.contextPacket.id, message: args.message })
  }

  private createProviderProgressSink(args: {
    attempt: TaskAttemptRecord
    contextPacket: ContextPacket
    getSession: () => TaskSessionRecord
    setSession: (session: TaskSessionRecord) => void
  }): { flush: () => Promise<void>; sink: ProviderProgressSink } {
    let pending: Promise<void> = Promise.resolve()
    const persistProgress = async (nextSession: TaskSessionRecord, progress: ProviderProgressEvent): Promise<void> => {
      const saved = await this.persist(nextSession)
      args.setSession(saved)
      this.setProviderPhaseState({ contextPacket: args.contextPacket, attemptId: args.attempt.id, message: progress.message, session: saved, status: saved.status })
      this.emit(this.providerListeners, progress)
    }

    return {
      flush: () => pending,
      sink: {
        emit: (progress: ProviderProgressEvent) => {
          const nextSession = applyProviderProgressToSession(args.getSession(), args.attempt.id, progress, this.now)
          args.setSession(nextSession)

          // Streaming text deltas and cancellation: fire listeners immediately without persisting.
          // Persisting every delta would serialize the entire stream through the session store,
          // adding per-event latency and preventing real-time text delivery to the renderer.
          if (progress.status === 'streaming' || progress.status === 'cancelled') {
            this.emit(this.providerListeners, progress)
            return
          }

          pending = pending.then(
            () => persistProgress(nextSession, progress),
            () => persistProgress(nextSession, progress),
          )
        },
      },
    }
  }

  private launchProviderTask(args: {
    adapter: ProviderAdapter
    attempt: TaskAttemptRecord
    contextPacket: ContextPacket
    resume: boolean
    session: TaskSessionRecord
    sink: ProviderProgressSink
  }): Promise<ProviderLaunchResult> {
    if (args.resume) {
      return args.adapter.resumeTask({ taskId: args.session.taskId, sessionId: args.session.id, attemptId: args.attempt.id, request: args.session.request, providerSession: args.session.providerSession, contextPacket: args.contextPacket, window: null }, args.sink)
    }

    return args.adapter.submitTask({ taskId: args.session.taskId, sessionId: args.session.id, attemptId: args.attempt.id, request: args.session.request, contextPacket: args.contextPacket, window: null }, args.sink)
  }

  private async completeProviderLaunch(args: {
    attempt: TaskAttemptRecord
    contextPacket: ContextPacket
    launched: ProviderLaunchResult
    resume: boolean
    session: TaskSessionRecord
  }): Promise<TaskSessionRecord> {
    const currentAttempt = args.session.attempts.find((entry) => entry.id === args.attempt.id) ?? args.attempt
    const updatedAttempt = { ...currentAttempt, status: 'applying' as const, providerArtifact: args.launched.artifact }
    const saved = await this.persist({
      ...args.session,
      status: 'applying',
      updatedAt: this.now(),
      contextPacket: args.contextPacket,
      providerSession: args.launched.session,
      nextSuggestedAction: 'resume_provider',
      attempts: args.session.attempts.map((entry) => entry.id === args.attempt.id ? updatedAttempt : entry),
    })
    this.setProviderPhaseState({ contextPacket: args.contextPacket, attemptId: updatedAttempt.id, message: args.resume ? 'Provider task resumed.' : 'Provider task submitted.', session: saved, status: 'applying' })
    return saved
  }

  private async failProviderLaunch(args: {
    attempt: TaskAttemptRecord
    contextPacket: ContextPacket
    error: unknown
    session: TaskSessionRecord
  }): Promise<TaskMutationResult> {
    const message = args.error instanceof Error ? args.error.message : String(args.error)
    const saved = await this.persist(applyProviderFailureToSession(args.session, args.attempt.id, message, this.now))
    this.setProviderPhaseState({ contextPacket: args.contextPacket, attemptId: args.attempt.id, message, session: saved, status: 'failed' })
    return { success: false, error: message, taskId: saved.taskId, session: saved, state: this.state, result: saved.latestResult }
  }

  private async runProviderPhase(taskId: string, resume: boolean, seedSession?: TaskSessionRecord): Promise<TaskMutationResult> {
    const initialSession = seedSession ?? await this.sessionForTask(taskId)
    if (!initialSession) return { success: false, error: `Task ${taskId} not found` }
    const adapter = this.providerRegistry.get(initialSession.request.provider)
    if (!adapter) return { success: false, error: `Provider ${initialSession.request.provider} is not registered` }
    const contextPacket = initialSession.contextPacket ?? await this.packetFor(initialSession.request)
    const started = await this.beginProviderPhase(initialSession, contextPacket)
    let currentSession = started.session
    const progress = this.createProviderProgressSink({ attempt: started.attempt, contextPacket, getSession: () => currentSession, setSession: (session) => { currentSession = session } })

    try {
      const launched = await this.launchProviderTask({ adapter, attempt: started.attempt, contextPacket, resume, session: currentSession, sink: progress.sink })
      await progress.flush()
      currentSession = await this.completeProviderLaunch({ attempt: started.attempt, contextPacket, launched, resume, session: currentSession })
      return { success: true, taskId: currentSession.taskId, session: currentSession, state: this.state, result: currentSession.latestResult }
    } catch (error) {
      await progress.flush()
      return this.failProviderLaunch({ attempt: started.attempt, contextPacket, error, session: currentSession })
    }
  }
}

export function createAgentLoopController(deps: AgentLoopControllerDeps = {}): AgentLoopController {
  return new AgentLoopController(deps)
}
