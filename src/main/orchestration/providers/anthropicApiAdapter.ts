import Anthropic from '@anthropic-ai/sdk'
import type { ContextPacket, ProviderCapabilities } from '../types'
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
import { createAnthropicClient } from './anthropicAuth'

/** Track active stream controllers for cancellation. */
const activeControllers = new Map<string, AbortController>()

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'anthropic-api',
    supportsStreaming: true,
    supportsResume: false,
    supportsStructuredEdits: false,
    supportsToolUse: false,
    supportsContextCaching: false,
    maxContextHint: 200000,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  }
}

function buildSystemPrompt(packet: ContextPacket | undefined, workspaceRoots: string[]): string {
  const lines: string[] = [
    'You are an expert software engineering assistant integrated into an IDE.',
    `Working directory: ${workspaceRoots[0] ?? 'unknown'}`,
  ]

  if (packet?.skillInstructions) {
    lines.push('--- Skill Instructions ---')
    lines.push(packet.skillInstructions)
    lines.push('---')
    lines.push('')
  }

  if (packet?.systemInstructions) {
    lines.push('--- Project Instructions ---')
    lines.push(packet.systemInstructions)
    lines.push('---')
    lines.push('')
  }

  if (packet) {
    const { repoFacts, liveIdeState } = packet

    if (repoFacts.gitDiff.changedFileCount > 0) {
      lines.push(
        `\nRecent git changes: ${repoFacts.gitDiff.changedFileCount} files (+${repoFacts.gitDiff.totalAdditions}/-${repoFacts.gitDiff.totalDeletions})`,
      )
    }

    if (repoFacts.diagnostics.totalErrors > 0 || repoFacts.diagnostics.totalWarnings > 0) {
      lines.push(
        `Diagnostics: ${repoFacts.diagnostics.totalErrors} errors, ${repoFacts.diagnostics.totalWarnings} warnings`,
      )
    }

    if (liveIdeState.activeFile) {
      lines.push(`Active file: ${liveIdeState.activeFile}`)
    }

    if (liveIdeState.openFiles.length > 0) {
      lines.push(`Open files: ${liveIdeState.openFiles.slice(0, 8).join(', ')}`)
    }

    if (packet.repoMap) {
      lines.push('\n--- Codebase Structure ---')
      lines.push(`Modules: ${packet.repoMap.moduleCount}`)
      for (const mod of packet.repoMap.modules.slice(0, 20)) {
        lines.push(`- ${mod.label} (${mod.rootPath}, ${mod.fileCount} files)${mod.recentlyChanged ? ' [recently changed]' : ''}`)
      }
    }

    if (packet.moduleSummaries && packet.moduleSummaries.length > 0) {
      lines.push('\n--- Relevant Module Context ---')
      for (const summary of packet.moduleSummaries) {
        lines.push(`\n### ${summary.label} (${summary.rootPath})`)
        if (summary.description) lines.push(summary.description)
        if (summary.keyResponsibilities.length > 0) {
          lines.push('Responsibilities: ' + summary.keyResponsibilities.join('; '))
        }
        if (summary.gotchas.length > 0) {
          lines.push('Gotchas: ' + summary.gotchas.join('; '))
        }
      }
    }

    if (packet.files.length > 0) {
      lines.push('\n--- Context Files ---')
      for (const file of packet.files.slice(0, 10)) {
        lines.push(`\n### ${file.filePath}`)
        for (const snippet of file.snippets.slice(0, 2)) {
          if (snippet.content) {
            const truncated =
              snippet.content.length > 1500
                ? `${snippet.content.slice(0, 1500)}\n...(truncated)`
                : snippet.content
            lines.push('```')
            lines.push(truncated)
            lines.push('```')
          }
        }
      }
    }
  }

  return lines.join('\n')
}

async function streamApiResponse(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
): Promise<ProviderLaunchResult> {
  const requestId = `anthropic-api-${context.attemptId}`
  const sessionRef = createProviderSessionReference('anthropic-api', {
    requestId,
    externalTaskId: context.taskId,
  })
  const submittedAt = Date.now()

  sink.emit(
    createProviderProgressEvent({
      provider: 'anthropic-api',
      status: 'queued',
      message: 'Connecting to Anthropic API',
      timestamp: submittedAt,
      session: sessionRef,
    }),
  )

  const controller = new AbortController()
  activeControllers.set(context.taskId, controller)

  const artifact = createProviderArtifact({
    provider: 'anthropic-api',
    status: 'streaming',
    session: sessionRef,
    submittedAt,
  })

  // Fire async — adapter returns synchronously so the caller can proceed
  void runStream(context, sink, sessionRef, controller).finally(() => {
    activeControllers.delete(context.taskId)
  })

  return { session: sessionRef, artifact }
}

/** Truncation notice appended as a streamed text delta when the model hits max_tokens. */
const TRUNCATION_NOTICE =
  '\n\n---\n*Response truncated — the model reached its output token limit. ' +
  'You can send a follow-up message to continue.*'

async function runStream(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  sessionRef: ReturnType<typeof createProviderSessionReference>,
  controller: AbortController,
): Promise<void> {
  const client = await createAnthropicClient()

  const contextPacket = 'contextPacket' in context ? context.contextPacket : undefined
  const systemPrompt = buildSystemPrompt(contextPacket, context.request.workspaceRoots)

  // Build messages array: conversation history (prior turns) + current user message
  const messages: Anthropic.MessageParam[] = [
    ...(context.request.conversationHistory ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: context.request.goal },
  ]

  try {
    const stream = await client.messages.stream(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 32_768,
        system: systemPrompt,
        messages,
      },
      { signal: controller.signal },
    )

    sink.emit(
      createProviderProgressEvent({
        provider: 'anthropic-api',
        status: 'streaming',
        message: '',
        timestamp: Date.now(),
        session: sessionRef,
      }),
    )

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sink.emit(
          createProviderProgressEvent({
            provider: 'anthropic-api',
            status: 'streaming',
            message: event.delta.text,
            timestamp: Date.now(),
            session: sessionRef,
          }),
        )
      }
    }

    // Check if the response was truncated due to max_tokens
    const finalMsg = await stream.finalMessage()
    if (finalMsg.stop_reason === 'max_tokens') {
      sink.emit(
        createProviderProgressEvent({
          provider: 'anthropic-api',
          status: 'streaming',
          message: TRUNCATION_NOTICE,
          timestamp: Date.now(),
          session: sessionRef,
        }),
      )
    }

    sink.emit(
      createProviderProgressEvent({
        provider: 'anthropic-api',
        status: 'completed',
        message: finalMsg.stop_reason === 'max_tokens'
          ? 'Response truncated (max tokens reached)'
          : 'Response complete',
        timestamp: Date.now(),
        session: sessionRef,
      }),
    )
  } catch (error) {
    if (controller.signal.aborted) {
      sink.emit(
        createProviderProgressEvent({
          provider: 'anthropic-api',
          status: 'cancelled',
          message: 'Cancelled',
          timestamp: Date.now(),
          session: sessionRef,
        }),
      )
      return
    }

    const message = error instanceof Error ? error.message : String(error)

    // Surface a clear message for auth failures
    const isAuthError = message.includes('401') || message.includes('authentication') || message.includes('Unauthorized')
    sink.emit(
      createProviderProgressEvent({
        provider: 'anthropic-api',
        status: 'failed',
        message: isAuthError
          ? 'Authentication failed — your OAuth token may have expired. Run "claude auth login" to re-authenticate.'
          : message,
        timestamp: Date.now(),
        session: sessionRef,
      }),
    )
  }
}

export class AnthropicApiAdapter implements ProviderAdapter {
  readonly provider = 'anthropic-api' as const

  getCapabilities(): ProviderCapabilities {
    return createCapabilities()
  }

  async submitTask(context: ProviderLaunchContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    return streamApiResponse(context, sink)
  }

  async resumeTask(context: ProviderResumeContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    // No native resume — treat as a new submission with conversation history intact
    return streamApiResponse(context, sink)
  }

  async cancelTask(session: { requestId?: string; sessionId?: string }): Promise<void> {
    const targetId = session.requestId ?? session.sessionId
    if (!targetId) return

    for (const [key, controller] of activeControllers) {
      if (key === targetId || controller) {
        controller.abort()
        activeControllers.delete(key)
        return
      }
    }
  }
}

export function createAnthropicApiAdapter(): AnthropicApiAdapter {
  return new AnthropicApiAdapter()
}
