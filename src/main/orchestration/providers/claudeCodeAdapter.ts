import { getConfigValue, type ClaudeCliSettings } from '../../config'
import type { ContextPacket, ProviderCapabilities } from '../types'
import { spawnStreamJsonProcess } from './claudeStreamJsonRunner'
import type { StreamJsonProcessHandle } from './streamJsonTypes'
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

/** Track active stream-json processes for cancellation. */
const activeProcesses = new Map<string, StreamJsonProcessHandle>()

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'claude-code',
    supportsStreaming: true,
    supportsResume: true,
    supportsStructuredEdits: false,
    supportsToolUse: true,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  }
}

function buildPromptPayload(context: ProviderLaunchContext | ProviderResumeContext): Record<string, unknown> {
  const packet = context.contextPacket
  return {
    task: packet?.task ?? {
      taskId: context.taskId,
      goal: context.request.goal,
      mode: context.request.mode,
      provider: context.request.provider,
      verificationProfile: context.request.verificationProfile,
    },
    workspaceRoots: context.request.workspaceRoots,
    repoFacts: packet ? summarizeRepoFacts(packet) : undefined,
    files: packet?.files.slice(0, 8).map(serializeContextFile) ?? [],
    omittedCandidates: packet?.omittedCandidates.slice(0, 8) ?? [],
    budget: packet?.budget,
    repoMap: packet?.repoMap ? {
      moduleCount: packet.repoMap.moduleCount,
      modules: packet.repoMap.modules.map((m) => ({
        id: m.id,
        path: m.rootPath,
        files: m.fileCount,
        exports: m.exports.slice(0, 5),
        changed: m.recentlyChanged,
      })),
    } : undefined,
    moduleSummaries: packet?.moduleSummaries?.map((s) => ({
      module: s.moduleId,
      description: s.description,
      responsibilities: s.keyResponsibilities,
      gotchas: s.gotchas,
    })) ?? undefined,
  }
}

function summarizeRepoFacts(packet: ContextPacket): Record<string, unknown> {
  return {
    workspaceRoots: packet.repoFacts.workspaceRoots,
    gitDiff: {
      changedFileCount: packet.repoFacts.gitDiff.changedFileCount,
      totalAdditions: packet.repoFacts.gitDiff.totalAdditions,
      totalDeletions: packet.repoFacts.gitDiff.totalDeletions,
    },
    diagnostics: {
      totalErrors: packet.repoFacts.diagnostics.totalErrors,
      totalWarnings: packet.repoFacts.diagnostics.totalWarnings,
    },
    recentEdits: packet.repoFacts.recentEdits.files.slice(0, 10),
    liveIdeState: {
      activeFile: packet.liveIdeState.activeFile,
      openFiles: packet.liveIdeState.openFiles.slice(0, 10),
      dirtyFiles: packet.liveIdeState.dirtyFiles.slice(0, 10),
    },
  }
}

function serializeContextFile(file: ContextPacket['files'][number]): Record<string, unknown> {
  return {
    filePath: file.filePath,
    score: file.score,
    confidence: file.confidence,
    reasons: file.reasons.map((reason) => reason.detail),
    snippets: file.snippets.slice(0, 3).map((snippet) => ({
      label: snippet.label,
      source: snippet.source,
      range: snippet.range,
      content: truncate(snippet.content),
    })),
  }
}

function truncate(value: string | undefined, maxLength = 1200): string | undefined {
  if (!value || value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength)}\n...(truncated)`
}

function buildInitialPrompt(context: ProviderLaunchContext | ProviderResumeContext): string {
  const payload = JSON.stringify(buildPromptPayload(context), null, 2)
  return [
    context.request.goal,
    '',
    'Use this IDE-prepared context packet as the starting context for the task:',
    '```json',
    payload,
    '```',
  ].join('\n')
}

function launchClaude(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeSessionId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`
  const settings = getConfigValue('claudeCliSettings') as ClaudeCliSettings
  const prompt = buildInitialPrompt(context)
  const cwd = context.request.workspaceRoots[0]

  // Emit initial queued event
  sink.emit(createProviderProgressEvent({
    provider: 'claude-code',
    status: 'queued',
    message: 'Launching Claude Code session',
    timestamp: Date.now(),
  }))

  // Track cumulative text length to emit only deltas (stream-json sends full text each time)
  let lastEmittedTextLength = 0

  // Spawn the stream-json child process
  const handle = spawnStreamJsonProcess({
    prompt,
    cwd,
    model: settings.model || undefined,
    permissionMode: settings.permissionMode !== 'default' ? settings.permissionMode : undefined,
    dangerouslySkipPermissions: settings.dangerouslySkipPermissions || undefined,
    resumeSessionId: resumeSessionId || undefined,
    continueSession: resumeSessionId === 'continue' ? true : undefined,
    onEvent: (event) => {
      if (event.type === 'assistant') {
        // Extract text content
        const textBlocks = event.message.content.filter((b) => b.type === 'text')
        const toolBlocks = event.message.content.filter((b) => b.type === 'tool_use')

        // Emit tool use blocks as structured markers
        for (const block of toolBlocks) {
          if (block.type === 'tool_use') {
            sink.emit(createProviderProgressEvent({
              provider: 'claude-code',
              status: 'streaming',
              message: `__tool__:${JSON.stringify({ name: block.name, status: 'running' })}`,
              timestamp: Date.now(),
              session: sessionRef,
            }))
          }
        }

        // Emit text delta (only the new portion since last event)
        if (textBlocks.length > 0) {
          const fullText = textBlocks.map((b) => b.text).join('')
          const delta = fullText.slice(lastEmittedTextLength)
          lastEmittedTextLength = fullText.length
          if (delta.length > 0) {
            sink.emit(createProviderProgressEvent({
              provider: 'claude-code',
              status: 'streaming',
              message: delta,
              timestamp: Date.now(),
              session: sessionRef,
            }))
          }
        }
      }
      // Skip 'system' events — those are internal
    },
  })

  // Store the handle for cancellation
  activeProcesses.set(context.taskId, handle)

  const sessionRef = createProviderSessionReference('claude-code', {
    requestId,
    sessionId: 'providerSession' in context ? context.providerSession?.sessionId : undefined,
    externalTaskId: context.taskId,
  })

  // Wire async completion
  handle.result.then(
    (_result) => {
      activeProcesses.delete(context.taskId)
      // Do NOT pass result.result here — response text was already streamed
      // as deltas via the onEvent callback. Passing it again would cause the
      // bridge to assemble a second, duplicate assistant message.
      sink.emit(createProviderProgressEvent({
        provider: 'claude-code',
        status: 'completed',
        message: 'Task completed successfully',
        timestamp: Date.now(),
        session: sessionRef,
      }))
    },
    (error) => {
      activeProcesses.delete(context.taskId)
      sink.emit(createProviderProgressEvent({
        provider: 'claude-code',
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        session: sessionRef,
      }))
    },
  )

  // Emit a status-only event so the bridge knows the session is live.
  // Must use 'queued' (not 'streaming') — the bridge accumulates all
  // 'streaming' messages as response text, so a status string here
  // would get prepended to the assistant message content.
  const submittedAt = Date.now()
  sink.emit(createProviderProgressEvent({
    provider: 'claude-code',
    status: 'queued',
    message: 'Claude Code session started',
    timestamp: submittedAt,
    session: sessionRef,
  }))

  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'claude-code',
      status: 'streaming',
      session: sessionRef,
      submittedAt,
      // Do not set lastMessage here — the response text is accumulated via
      // streaming deltas and written by the bridge. Setting it to a status
      // string would cause the session-update projector to use it as the
      // assistant message content before the bridge can overwrite it.
    }),
  }
}

export class ClaudeCodeAdapter implements ProviderAdapter {
  readonly provider = 'claude-code' as const

  getCapabilities(): ProviderCapabilities {
    return createCapabilities()
  }

  async submitTask(context: ProviderLaunchContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    return launchClaude(context, sink)
  }

  async resumeTask(context: ProviderResumeContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    return launchClaude(context, sink, context.providerSession?.sessionId ?? 'continue')
  }

  async cancelTask(session: { requestId?: string; sessionId?: string }): Promise<void> {
    const targetId = session.requestId ?? session.sessionId
    if (!targetId) return

    // Try direct lookup
    const handle = activeProcesses.get(targetId)
    if (handle) {
      handle.kill()
      activeProcesses.delete(targetId)
      return
    }

    // Also check by iterating (taskId might not match key exactly)
    for (const [key, proc] of activeProcesses) {
      if (proc.sessionId === targetId) {
        proc.kill()
        activeProcesses.delete(key)
        return
      }
    }
  }
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter()
}
