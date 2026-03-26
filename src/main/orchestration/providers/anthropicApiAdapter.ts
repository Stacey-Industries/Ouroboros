import Anthropic from '@anthropic-ai/sdk'

import type { ContextPacket, ProviderCapabilities } from '../types'
import { createAnthropicClient } from './anthropicAuth'
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

function appendInstructionBlock(lines: string[], header: string, content: string): void {
  lines.push(`--- ${header} ---`)
  lines.push(content)
  lines.push('---')
  lines.push('')
}

function appendRepoFactsLines(lines: string[], packet: ContextPacket): void {
  const { repoFacts, liveIdeState } = packet
  if (repoFacts.gitDiff.changedFileCount > 0) {
    lines.push(
      `\nRecent git changes: ${repoFacts.gitDiff.changedFileCount} files (+${repoFacts.gitDiff.totalAdditions}/-${repoFacts.gitDiff.totalDeletions})`,
    )
  }
  if (repoFacts.diagnostics.totalErrors > 0 || repoFacts.diagnostics.totalWarnings > 0) {
    lines.push(`Diagnostics: ${repoFacts.diagnostics.totalErrors} errors, ${repoFacts.diagnostics.totalWarnings} warnings`)
  }
  if (liveIdeState.activeFile) lines.push(`Active file: ${liveIdeState.activeFile}`)
  if (liveIdeState.openFiles.length > 0) lines.push(`Open files: ${liveIdeState.openFiles.slice(0, 8).join(', ')}`)
}

function appendRepoMapLines(lines: string[], packet: ContextPacket): void {
  if (!packet.repoMap) return
  lines.push('\n--- Codebase Structure ---')
  lines.push(`Modules: ${packet.repoMap.moduleCount}`)
  for (const mod of packet.repoMap.modules.slice(0, 20)) {
    lines.push(`- ${mod.label} (${mod.rootPath}, ${mod.fileCount} files)${mod.recentlyChanged ? ' [recently changed]' : ''}`)
  }
}

function appendModuleSummaryLines(lines: string[], packet: ContextPacket): void {
  if (!packet.moduleSummaries || packet.moduleSummaries.length === 0) return
  lines.push('\n--- Relevant Module Context ---')
  for (const summary of packet.moduleSummaries) {
    lines.push(`\n### ${summary.label} (${summary.rootPath})`)
    if (summary.description) lines.push(summary.description)
    if (summary.keyResponsibilities.length > 0) lines.push('Responsibilities: ' + summary.keyResponsibilities.join('; '))
    if (summary.gotchas.length > 0) lines.push('Gotchas: ' + summary.gotchas.join('; '))
  }
}

function appendContextFileLines(lines: string[], packet: ContextPacket): void {
  if (packet.files.length === 0) return
  lines.push('\n--- Context Files ---')
  for (const file of packet.files.slice(0, 10)) {
    lines.push(`\n### ${file.filePath}`)
    for (const snippet of file.snippets.slice(0, 2)) {
      if (!snippet.content) continue
      const truncated = snippet.content.length > 1500
        ? `${snippet.content.slice(0, 1500)}\n...(truncated)`
        : snippet.content
      lines.push('```')
      lines.push(truncated)
      lines.push('```')
    }
  }
}

function buildSystemPrompt(packet: ContextPacket | undefined, workspaceRoots: string[]): string {
  const lines: string[] = [
    'You are an expert software engineering assistant integrated into an IDE.',
    `Working directory: ${workspaceRoots[0] ?? 'unknown'}`,
  ]
  if (packet?.skillInstructions) appendInstructionBlock(lines, 'Skill Instructions', packet.skillInstructions)
  if (packet?.systemInstructions) appendInstructionBlock(lines, 'Project Instructions', packet.systemInstructions)
  if (packet) {
    appendRepoFactsLines(lines, packet)
    appendRepoMapLines(lines, packet)
    appendModuleSummaryLines(lines, packet)
    appendContextFileLines(lines, packet)
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
    createProviderProgressEvent('queued', {
      provider: 'anthropic-api',
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

type SessionRef = ReturnType<typeof createProviderSessionReference>

function emitStreamEvent(
  sink: ProviderProgressSink,
  status: Parameters<typeof createProviderProgressEvent>[0],
  message: string,
  sessionRef: SessionRef,
): void {
  sink.emit(createProviderProgressEvent(status, { provider: 'anthropic-api', message, timestamp: Date.now(), session: sessionRef }))
}

function buildMessages(context: ProviderLaunchContext | ProviderResumeContext): Anthropic.MessageParam[] {
  return [
    ...(context.request.conversationHistory ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: context.request.goal },
  ]
}

async function consumeStream(
  stream: Awaited<ReturnType<Anthropic['messages']['stream']>>,
  sink: ProviderProgressSink,
  sessionRef: SessionRef,
): Promise<void> {
  emitStreamEvent(sink, 'streaming', '', sessionRef)
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      emitStreamEvent(sink, 'streaming', event.delta.text, sessionRef)
    }
  }
  const finalMsg = await stream.finalMessage()
  if (finalMsg.stop_reason === 'max_tokens') {
    emitStreamEvent(sink, 'streaming', TRUNCATION_NOTICE, sessionRef)
  }
  const completionMessage = finalMsg.stop_reason === 'max_tokens' ? 'Response truncated (max tokens reached)' : 'Response complete'
  emitStreamEvent(sink, 'completed', completionMessage, sessionRef)
}

function handleStreamError(error: unknown, controller: AbortController, sink: ProviderProgressSink, sessionRef: SessionRef): void {
  if (controller.signal.aborted) {
    emitStreamEvent(sink, 'cancelled', 'Cancelled', sessionRef)
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  const isAuthError = message.includes('401') || message.includes('authentication') || message.includes('Unauthorized')
  emitStreamEvent(
    sink,
    'failed',
    isAuthError ? 'Authentication failed — your OAuth token may have expired. Run "claude auth login" to re-authenticate.' : message,
    sessionRef,
  )
}

async function runStream(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  sessionRef: SessionRef,
  controller: AbortController,
): Promise<void> {
  const client = await createAnthropicClient()
  const contextPacket = 'contextPacket' in context ? context.contextPacket : undefined
  const systemPrompt = buildSystemPrompt(contextPacket, context.request.workspaceRoots)
  const messages = buildMessages(context)
  try {
    const stream = await client.messages.stream({ model: 'claude-sonnet-4-6', max_tokens: 32_768, system: systemPrompt, messages }, { signal: controller.signal })
    await consumeStream(stream, sink, sessionRef)
  } catch (error) {
    handleStreamError(error, controller, sink, sessionRef)
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
