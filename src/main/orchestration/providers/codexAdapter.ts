import type { ProviderCapabilities } from '../types'
import {
  createProviderArtifact,
  createProviderProgressEvent,
  createProviderSessionReference,
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter'

interface CodexAdapterDeps {
  cancel?: (session: { requestId?: string; sessionId?: string }) => Promise<void>
  launch?: (context: ProviderLaunchContext) => Promise<{ requestId?: string; sessionId?: string; message?: string }>
  resume?: (context: ProviderResumeContext) => Promise<{ requestId?: string; sessionId?: string; message?: string }>
}

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'codex',
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

function buildResult(
  requestId: string | undefined,
  sessionId: string | undefined,
  message: string,
  sink: ProviderProgressSink,
): ProviderLaunchResult {
  const submittedAt = Date.now()
  const session = createProviderSessionReference('codex', { requestId, sessionId })
  sink.emit(createProviderProgressEvent({
    provider: 'codex',
    status: 'completed',
    message,
    timestamp: submittedAt,
    session,
  }))
  return {
    session,
    artifact: createProviderArtifact({
      provider: 'codex',
      status: 'completed',
      session,
      submittedAt,
      lastMessage: message,
      completedAt: submittedAt,
    }),
  }
}

async function requireLaunch<T>(
  action: ((context: T) => Promise<{ requestId?: string; sessionId?: string; message?: string }>) | undefined,
  context: T,
  sink: ProviderProgressSink,
  phase: string,
): Promise<ProviderLaunchResult> {
  if (!action) {
    sink.emit(createProviderProgressEvent({
      provider: 'codex',
      status: 'failed',
      message: `Codex adapter is not configured for ${phase}`,
      timestamp: Date.now(),
    }))
    throw new Error(`Codex adapter is not configured for ${phase}`)
  }
  sink.emit(createProviderProgressEvent({
    provider: 'codex',
    status: 'queued',
    message: `Starting Codex ${phase}`,
    timestamp: Date.now(),
  }))
  const result = await action(context)
  return buildResult(result.requestId, result.sessionId, result.message ?? `Codex ${phase} completed`, sink)
}

export class CodexAdapter implements ProviderAdapter {
  readonly provider = 'codex' as const

  constructor(private readonly deps: CodexAdapterDeps = {}) { }

  getCapabilities(): ProviderCapabilities {
    return createCapabilities()
  }

  async submitTask(context: ProviderLaunchContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    return requireLaunch(this.deps.launch, context, sink, 'launch')
  }

  async resumeTask(context: ProviderResumeContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    return requireLaunch(this.deps.resume, context, sink, 'resume')
  }

  async cancelTask(session: { requestId?: string; sessionId?: string }): Promise<void> {
    if (!this.deps.cancel) {
      return
    }
    await this.deps.cancel(session)
  }
}

export function createCodexAdapter(deps: CodexAdapterDeps = {}): CodexAdapter {
  return new CodexAdapter(deps)
}
