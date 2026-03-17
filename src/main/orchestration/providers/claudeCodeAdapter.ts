import path from 'path'
import { BrowserWindow } from 'electron'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { getConfigValue, type ClaudeCliSettings } from '../../config'
import { spawnAgentPty, killPty, type AgentPtyResult } from '../../pty'
import type { AgentBridgeHandle } from '../../ptyAgentBridge'
import type { ContextPacket, ProviderCapabilities } from '../types'
import type { ImageAttachment } from '../../agentChat/types'
import { getModelBudgets } from '../contextPacketBuilderSupport'
import { spawnStreamJsonProcess } from './claudeStreamJsonRunner'
import type { StreamJsonProcessHandle, StreamJsonResultEvent } from './streamJsonTypes'
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

/**
 * Build a user-visible diagnostic when the agent stopped for a reason other
 * than normal end_turn. Returns null if the stop was normal / unremarkable.
 */
function buildStopDiagnostic(
  result: StreamJsonResultEvent | null,
  model: string | undefined,
): string | null {
  if (!result) {
    return '\n\n---\n**Agent stopped** — no result event received from Claude Code process.'
  }

  const parts: string[] = []

  // Error result
  if (result.is_error || result.subtype === 'error') {
    parts.push(`**Agent stopped** — Claude Code reported an error`)
    if (result.result) {
      parts.push(`\`\`\`\n${result.result.slice(0, 500)}\n\`\`\``)
    }
  }

  // max_tokens — model ran out of output budget
  if (result.stop_reason === 'max_tokens') {
    parts.push(`**Agent stopped** — hit output token limit (stop_reason: max_tokens, model: ${model ?? 'unknown'})`)
  }

  // Unexpected stop reason
  if (result.stop_reason && result.stop_reason !== 'end_turn' && result.stop_reason !== 'max_tokens') {
    parts.push(`**Agent stopped** — unexpected stop_reason: \`${result.stop_reason}\``)
  }

  if (parts.length === 0) return null
  return '\n\n---\n' + parts.join('\n')
}

/**
 * Track active PTY-backed agent sessions.
 * Key: taskId. Value: { ptySessionId, bridge, result }.
 */
interface ActiveAgentPtyEntry {
  ptySessionId: string
  bridge: AgentBridgeHandle
  result: Promise<StreamJsonResultEvent | null>
}
const activeAgentPtySessions = new Map<string, ActiveAgentPtyEntry>()

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

async function materializeAttachments(
  attachments: ImageAttachment[],
): Promise<{ goalSuffix: string; tempPaths: string[] }> {
  const tempPaths: string[] = []
  const lines: string[] = []
  for (const att of attachments) {
    const ext = att.mimeType.split('/')[1] ?? 'png'
    const tempPath = `${tmpdir()}/${randomUUID()}.${ext}`
    await writeFile(tempPath, Buffer.from(att.base64Data, 'base64'))
    tempPaths.push(tempPath)
    lines.push(`[Attached image: ${tempPath}]`)
  }
  return { goalSuffix: lines.length ? '\n\n' + lines.join('\n') : '', tempPaths }
}

async function cleanupTempFiles(tempPaths: string[]): Promise<void> {
  for (const p of tempPaths) {
    try {
      await unlink(p)
    } catch {
      // Ignore cleanup errors — temp files will be cleaned by OS eventually
    }
  }
}

// ---------------------------------------------------------------------------
// XML context block — structured IDE context for Claude's training distribution
// ---------------------------------------------------------------------------

function buildCurrentFocusSection(packet: ContextPacket): string {
  const ide = packet.liveIdeState
  const lines: string[] = ['<current_focus>']

  if (ide.activeFile) {
    const dirty = ide.dirtyFiles.includes(ide.activeFile) ? ' (unsaved changes)' : ''
    lines.push(`Active file: ${path.basename(ide.activeFile)}${dirty}`)
  }

  if (ide.selection) {
    lines.push(`Cursor/selection: lines ${ide.selection.startLine}-${ide.selection.endLine}`)
  }

  const openCount = ide.openFiles.length
  if (openCount > 0) {
    const dirtySet = new Set(ide.dirtyFiles.map((f) => f.toLowerCase()))
    const fileList = ide.openFiles.slice(0, 12).map((f) => {
      const isDirty = dirtySet.has(f.toLowerCase())
      const basename = path.basename(f)
      return isDirty ? `${basename} (dirty)` : basename
    })
    lines.push(`Open tabs (${openCount}): ${fileList.join(', ')}`)
  }

  lines.push('</current_focus>')
  return lines.join('\n')
}

function buildWorkspaceStateSection(packet: ContextPacket): string {
  const diff = packet.repoFacts.gitDiff
  const diag = packet.repoFacts.diagnostics

  const attrs: string[] = []
  if (diff.currentBranch) attrs.push(`branch="${diff.currentBranch}"`)
  attrs.push(`changed_files="${diff.changedFileCount}"`)
  if (diag.totalErrors > 0) attrs.push(`errors="${diag.totalErrors}"`)
  if (diag.totalWarnings > 0) attrs.push(`warnings="${diag.totalWarnings}"`)

  const lines: string[] = [`<workspace_state ${attrs.join(' ')}>`]

  // Recent commits
  const commits = packet.repoFacts.recentCommits
  if (commits && commits.length > 0) {
    lines.push('Recent commits:')
    for (const c of commits.slice(0, 5)) {
      lines.push(`- ${c.hash} ${c.message}`)
    }
  }

  // Recently edited files
  const recentEdits = packet.repoFacts.recentEdits.files.slice(0, 8)
  if (recentEdits.length > 0) {
    lines.push(`Recently edited: ${recentEdits.map((f) => path.basename(f)).join(', ')}`)
  }

  // Dirty buffers summary
  const dirtyCount = packet.liveIdeState.dirtyFiles.length
  if (dirtyCount > 0) {
    lines.push(`Unsaved buffers (${dirtyCount}): ${packet.liveIdeState.dirtyFiles.map((f) => path.basename(f)).join(', ')}`)
  }

  lines.push('</workspace_state>')
  return lines.join('\n')
}

function buildRelevantCodeSection(packet: ContextPacket, model: string): string {
  const budgets = getModelBudgets(model)
  const maxSnippetChars = model.includes('opus') ? 4000 : 2000

  const lines: string[] = ['<relevant_code>']

  for (const file of packet.files.slice(0, budgets.maxFiles)) {
    const reasons = file.reasons.map((r) => r.detail).slice(0, 3).join('; ')
    lines.push(`<file path="${file.filePath}" score="${file.score}" confidence="${file.confidence}" reasons="${reasons}">`)

    for (const snippet of file.snippets) {
      const content = snippet.content?.slice(0, maxSnippetChars) ?? ''
      if (!content) continue
      lines.push('```')
      lines.push(`// ${snippet.label} — lines ${snippet.range.startLine}-${snippet.range.endLine}`)
      lines.push(content)
      lines.push('```')
    }

    lines.push('</file>')
  }

  lines.push('</relevant_code>')
  return lines.join('\n')
}

function buildProjectStructureSection(packet: ContextPacket): string {
  const lines: string[] = []

  const moduleCount = packet.repoMap?.moduleCount ?? 0
  lines.push(`<project_structure modules="${moduleCount}">`)

  if (packet.repoMap) {
    const rm = packet.repoMap
    lines.push(`Project: ${rm.projectName}`)
    lines.push(`Languages: ${rm.languages.join(', ')}`)
    if (rm.frameworks.length > 0) {
      lines.push(`Frameworks: ${rm.frameworks.join(', ')}`)
    }
  }

  if (packet.moduleSummaries && packet.moduleSummaries.length > 0) {
    lines.push('')
    lines.push('Relevant modules:')
    for (const mod of packet.moduleSummaries) {
      const deps = mod.dependencies?.length
        ? ` Depends on: ${mod.dependencies.join(', ')}.`
        : ''
      lines.push(`- ${mod.moduleId} (${mod.label}) — ${mod.description}${deps}`)

      if (mod.keyResponsibilities.length > 0) {
        lines.push(`  Responsibilities: ${mod.keyResponsibilities.join('; ')}`)
      }
      if (mod.gotchas.length > 0) {
        lines.push(`  Gotchas: ${mod.gotchas.join('; ')}`)
      }
    }
  }

  lines.push('</project_structure>')
  return lines.join('\n')
}

function buildDiagnosticsSection(packet: ContextPacket): string {
  const diag = packet.repoFacts.diagnostics
  if (diag.totalErrors === 0 && diag.totalWarnings === 0) return ''

  const lines: string[] = [`<diagnostics errors="${diag.totalErrors}" warnings="${diag.totalWarnings}">`]

  for (const file of diag.files) {
    if (!file.messages || file.messages.length === 0) continue
    for (const msg of file.messages) {
      lines.push(`${path.basename(file.filePath)}:${msg.line} — ${msg.severity}: ${msg.message}`)
    }
  }

  lines.push('</diagnostics>')
  return lines.join('\n')
}

function buildTerminalSection(packet: ContextPacket): string {
  const snapshots = packet.liveIdeState.terminalSnapshots
  if (!snapshots || snapshots.length === 0) return ''

  const lines: string[] = [`<terminal_output sessions="${snapshots.length}">`]

  const selected = snapshots.slice(0, 5)
  for (let i = 0; i < selected.length; i++) {
    const snap = selected[i]
    // Latest session gets more lines for richer debugging context
    const lineLimit = i === selected.length - 1 ? 120 : 80
    const sessionLines = snap.lines.slice(-lineLimit)
    if (sessionLines.length === 0) continue
    lines.push(`Session ${snap.sessionId}:`)
    lines.push(sessionLines.join('\n'))
  }

  lines.push('</terminal_output>')
  return lines.join('\n')
}

function buildXmlContextBlock(
  context: ProviderLaunchContext | ProviderResumeContext,
  model: string,
): string {
  const packet = context.contextPacket
  if (!packet) return ''

  const sections: string[] = []
  sections.push('<ide_context>')

  sections.push(buildCurrentFocusSection(packet))
  sections.push(buildWorkspaceStateSection(packet))
  sections.push(buildRelevantCodeSection(packet, model))
  sections.push(buildProjectStructureSection(packet))
  sections.push(buildDiagnosticsSection(packet))
  sections.push(buildTerminalSection(packet))

  sections.push('</ide_context>')
  return sections.filter(Boolean).join('\n\n')
}

function buildInitialPrompt(
  context: ProviderLaunchContext | ProviderResumeContext,
  goalSuffix = '',
  isResume = false,
  model = '',
): string {
  const lines: string[] = []

  // Skip conversation history when resuming — Claude Code has native multi-turn context
  if (!isResume) {
    const history = context.request.conversationHistory
    if (history && history.length > 0) {
      lines.push('<conversation_history>')
      for (const msg of history) {
        const tag = msg.role === 'user' ? 'user_message' : 'assistant_message'
        lines.push(`<${tag}>${msg.content}</${tag}>`)
      }
      lines.push('</conversation_history>')
      lines.push('')
    }
  }

  lines.push(context.request.goal + goalSuffix)
  lines.push('')
  lines.push(buildXmlContextBlock(context, model))

  return lines.join('\n')
}

/**
 * Build the event handler callback shared by both PTY-backed and headless launches.
 * Returns a handler that processes stream-json events and emits deltas via the sink.
 */
function buildEventHandler(
  sink: ProviderProgressSink,
  sessionRef: ReturnType<typeof createProviderSessionReference>,
): {
  handler: (event: import('./streamJsonTypes').StreamJsonEvent) => void
  getLastEmittedTextLength: () => number
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number }
} {
  let lastEmittedTextLength = 0
  /** Track tool_use_id -> tool name so we can emit completion when tool_result arrives. */
  const toolUseIdToName = new Map<string, string>()
  /**
   * Token tracking strategy:
   * - inputTokens: last turn's input_tokens (non-cached portion sent to the model).
   *   This is an undercount of true context window utilization (excludes cache reads)
   *   but is the most reliable per-turn value from stream-json. We overwrite per turn
   *   so it reflects the most recent request's context size.
   * - outputTokens: cumulative across all turns within this task invocation.
   */
  let lastTurnInputTokens = 0
  let cumulativeOutputTokens = 0

  const handler = (event: import('./streamJsonTypes').StreamJsonEvent) => {
    if (event.type === 'assistant') {
      // Claude Code's stream-json format never emits tool_result blocks as events —
      // tool results are consumed internally and fed back to the model. When a new
      // assistant response arrives it means all tools from the previous turn are done.
      for (const [, prevName] of toolUseIdToName) {
        sink.emit(createProviderProgressEvent({
          provider: 'claude-code',
          status: 'streaming',
          message: `__tool__:${JSON.stringify({ name: prevName, status: 'complete' })}`,
          timestamp: Date.now(),
          session: sessionRef,
        }))
      }
      toolUseIdToName.clear()

      const textBlocks = event.message.content.filter((b) => b.type === 'text')
      const toolBlocks = event.message.content.filter((b) => b.type === 'tool_use')
      const thinkingBlocks = event.message.content.filter((b) => b.type === 'thinking')

      for (const block of toolBlocks) {
        if (block.type === 'tool_use') {
          toolUseIdToName.set(block.id, block.name)
          const toolPayload: Record<string, unknown> = { name: block.name, status: 'running' }
          // Extract useful fields from tool input for renderer display
          const inp = block.input as Record<string, unknown> | undefined
          if (inp) {
            const fp = inp.file_path ?? inp.filePath ?? inp.path
            if (typeof fp === 'string') toolPayload.filePath = fp
            if (typeof inp.command === 'string') {
              toolPayload.inputSummary = inp.command.length > 200 ? inp.command.slice(0, 197) + '...' : inp.command
            } else if (typeof inp.pattern === 'string') {
              toolPayload.inputSummary = `/${inp.pattern}/` + (typeof inp.glob === 'string' ? ` in ${inp.glob}` : '')
            } else if (typeof inp.description === 'string') {
              toolPayload.inputSummary = inp.description.length > 150 ? inp.description.slice(0, 147) + '...' : inp.description
            }
            // For Edit tools, include a compact summary of what changed
            if (typeof inp.old_string === 'string' && typeof inp.new_string === 'string') {
              const oldLines = inp.old_string.split('\n').length
              const newLines = inp.new_string.split('\n').length
              toolPayload.editSummary = { oldLines, newLines }
            }
          }
          sink.emit(createProviderProgressEvent({
            provider: 'claude-code',
            status: 'streaming',
            message: `__tool__:${JSON.stringify(toolPayload)}`,
            timestamp: Date.now(),
            session: sessionRef,
          }))
        }
      }

      // Emit thinking blocks so the renderer can display extended thinking
      for (const block of thinkingBlocks) {
        if (block.type === 'thinking' && block.thinking) {
          sink.emit(createProviderProgressEvent({
            provider: 'claude-code',
            status: 'streaming',
            message: `__thinking__:${block.thinking}`,
            timestamp: Date.now(),
            session: sessionRef,
          }))
        }
      }

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

      // Track per-turn tokens: overwrite input (last turn's context), accumulate output.
      const usage = event.message.usage
      if (usage) {
        // input_tokens reflects non-cached tokens for this turn's request.
        // Combined with cache_creation, it approximates fresh context utilization.
        const turnInput = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        if (turnInput > 0) lastTurnInputTokens = turnInput
        cumulativeOutputTokens += usage.output_tokens ?? 0
      }
    }
    // Capture session ID from system init events (needed for --resume)
    if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
      sessionRef.sessionId = event.session_id
    }
  }
  return {
    handler,
    getLastEmittedTextLength: () => lastEmittedTextLength,
    getCumulativeUsage: () => ({ inputTokens: lastTurnInputTokens, outputTokens: cumulativeOutputTokens }),
  }
}

/**
 * Get the first non-destroyed BrowserWindow, used for PTY-backed launches.
 * Returns null if no window is available.
 */
function getActiveBrowserWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.find((w) => !w.isDestroyed()) ?? null
}

/** The PTY session ID prefix for agent-spawned terminals. */
const AGENT_PTY_PREFIX = 'agent-pty-'

/**
 * Attempt to launch Claude via a real PTY session.
 * Returns null if PTY launch fails (caller should fall back to headless).
 */
function tryLaunchPtyBacked(args: {
  context: ProviderLaunchContext | ProviderResumeContext
  prompt: string
  cwd: string
  settings: ClaudeCliSettings
  sessionRef: ReturnType<typeof createProviderSessionReference>
  sink: ProviderProgressSink
  resumeSessionId?: string
  continueSession?: boolean
  effort?: string
}): { ptySessionId: string; result: Promise<StreamJsonResultEvent | null> } | null {
  const win = args.context.window ?? getActiveBrowserWindow()
  if (!win) return null

  const ptyId = `${AGENT_PTY_PREFIX}${args.context.attemptId}`

  const { handler } = buildEventHandler(args.sink, args.sessionRef)

  const ptyResult: AgentPtyResult = spawnAgentPty(ptyId, win, {
    prompt: args.prompt,
    cwd: args.cwd,
    model: args.settings.model || undefined,
    permissionMode: args.settings.permissionMode !== 'default' ? args.settings.permissionMode : undefined,
    dangerouslySkipPermissions: args.settings.dangerouslySkipPermissions || undefined,
    resumeSessionId: args.resumeSessionId || undefined,
    continueSession: args.continueSession || undefined,
    effort: args.effort || undefined,
    onEvent: handler,
  })

  if (!ptyResult.success || !ptyResult.result) {
    console.warn('[claude-code] PTY-backed launch failed, falling back to headless:', ptyResult.error)
    return null
  }

  // Track for cancellation
  activeAgentPtySessions.set(args.context.taskId, {
    ptySessionId: ptyId,
    bridge: ptyResult.bridge!,
    result: ptyResult.result,
  })

  return { ptySessionId: ptyId, result: ptyResult.result }
}

/**
 * Launch Claude via headless child_process (original approach, used as fallback).
 */
function launchHeadless(args: {
  context: ProviderLaunchContext | ProviderResumeContext
  prompt: string
  cwd: string
  settings: ClaudeCliSettings
  sessionRef: ReturnType<typeof createProviderSessionReference>
  sink: ProviderProgressSink
  resumeSessionId?: string
  continueSession?: boolean
  effort?: string
  /** Pre-built event handler — when provided, skips internal buildEventHandler call. */
  eventHandler?: (event: import('./streamJsonTypes').StreamJsonEvent) => void
}): { result: Promise<StreamJsonResultEvent> } {
  const handler = args.eventHandler ?? buildEventHandler(args.sink, args.sessionRef).handler

  const handle = spawnStreamJsonProcess({
    prompt: args.prompt,
    cwd: args.cwd,
    model: args.settings.model || undefined,
    permissionMode: args.settings.permissionMode !== 'default' ? args.settings.permissionMode : undefined,
    dangerouslySkipPermissions: args.settings.dangerouslySkipPermissions || undefined,
    resumeSessionId: args.resumeSessionId || undefined,
    continueSession: args.continueSession || undefined,
    effort: args.effort || undefined,
    onEvent: handler,
  })

  activeProcesses.set(args.context.taskId, handle)
  return { result: handle.result }
}

function launchClaude(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeSessionId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`
  const settings = getConfigValue('claudeCliSettings') as ClaudeCliSettings
  const cwd = context.request.workspaceRoots[0]

  // Resolve per-request overrides: chat controls → global settings → undefined
  const resolvedModel = context.request.model || settings.model || undefined
  const effort = context.request.effort || settings.effort || undefined
  const resolvedPermissionMode = context.request.permissionMode || settings.permissionMode || 'default'

  console.log('[claude-code] launchClaude called:', { cwd, model: resolvedModel, effort, permissionMode: resolvedPermissionMode, resumeSessionId: resumeSessionId || context.request.resumeFromSessionId })

  // Emit initial queued event
  sink.emit(createProviderProgressEvent({
    provider: 'claude-code',
    status: 'queued',
    message: 'Launching Claude Code session',
    timestamp: Date.now(),
  }))

  const sessionRef = createProviderSessionReference('claude-code', {
    requestId,
    sessionId: 'providerSession' in context ? context.providerSession?.sessionId : undefined,
    externalTaskId: context.taskId,
  })

  // Build an effective settings object that applies per-request overrides.
  // This ensures the CLI --model and --permission-mode flags reflect what
  // the user picked in the chat controls, not just the global settings.
  const effectiveSettings: ClaudeCliSettings = {
    ...settings,
    model: resolvedModel ?? '',
    permissionMode: resolvedPermissionMode,
  }

  // When resuming without a concrete session ID, use --continue instead of --resume
  const isResumeContext = 'providerSession' in context
  // Use request-level resume session ID if no explicit resume param was passed.
  // This enables follow-up chat messages to resume the prior Claude Code session.
  const effectiveResumeSessionId = resumeSessionId || context.request.resumeFromSessionId || undefined
  const continueSession = isResumeContext && !effectiveResumeSessionId ? true : undefined

  // Use headless child_process for stream-json mode.
  // PTY + `-p` (print mode) is incompatible: `-p` expects pipe stdin, but PTY
  // provides a TTY which breaks EOF signalling and causes immediate exit on Windows.
  // The headless path uses proper pipe stdin/stdout for reliable NDJSON streaming.
  // TODO: Re-enable PTY path with interactive-mode bridge (no `-p` flag).
  const linkedTerminalId: string | undefined = undefined
  console.log('[claude-code] launching headless stream-json process', effectiveResumeSessionId ? `(resuming session ${effectiveResumeSessionId})` : '(new session)')

  // Create the event handler here so we can access cumulative usage in the completion handler.
  const { handler: eventHandler, getCumulativeUsage } = buildEventHandler(sink, sessionRef)

  // Materialize image attachments as temp files (async), then launch the process.
  // This runs in the background so the synchronous ProviderLaunchResult can be returned immediately.
  // Each invocation tracks its own temp paths to avoid a shared-closure race between concurrent calls.
  const invocationTempPaths: string[] = []
  const launchPromise = (async () => {
    let goalSuffix = ''
    if (context.request.goalAttachments?.length) {
      try {
        const materialized = await materializeAttachments(context.request.goalAttachments)
        goalSuffix = materialized.goalSuffix
        invocationTempPaths.push(...materialized.tempPaths)
      } catch (err) {
        console.error('[claude-code] failed to materialize attachments — images will be omitted from this request:', err)
      }
    }
    const prompt = buildInitialPrompt(context, goalSuffix, Boolean(effectiveResumeSessionId), resolvedModel ?? '')
    const launchArgs = { context, prompt, cwd, settings: effectiveSettings, sessionRef, sink, resumeSessionId: effectiveResumeSessionId, continueSession, effort }
    const headless = launchHeadless({ ...launchArgs, eventHandler })
    return headless.result
  })()

  const resultPromise: Promise<StreamJsonResultEvent | null> = launchPromise.then(
    (innerResult) => innerResult,
    (err) => { throw err },
  )

  // Wire async completion
  resultPromise.then(
    (_result) => {
      activeProcesses.delete(context.taskId)
      activeAgentPtySessions.delete(context.taskId)
      // Clean up any temp image files written for this invocation
      void cleanupTempFiles(invocationTempPaths)

      // Extract cost and duration from the result event
      const costUsd = _result?.total_cost_usd
      const durationMs = _result?.duration_ms

      // Prefer per-turn tracking (inputTokens = last turn's context window size,
      // outputTokens = cumulative output). Fall back to result event if unavailable.
      const tracked = getCumulativeUsage()
      let inputTokens: number | undefined
      let outputTokens: number | undefined

      if (tracked.inputTokens > 0 || tracked.outputTokens > 0) {
        inputTokens = tracked.inputTokens
        outputTokens = tracked.outputTokens
      } else {
        // Fall back to result event usage. The result event accumulates cache_read_input_tokens
        // across all turns, so exclude it to avoid inflating the displayed context size.
        const usage = _result?.usage as Record<string, number | undefined> | undefined
        if (usage) {
          inputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
          outputTokens = usage.output_tokens
        }
      }
      const hasTokenUsage = typeof inputTokens === 'number' && typeof outputTokens === 'number'

      // Surface diagnostics as a visible text delta BEFORE emitting 'completed'.
      // This ensures the user sees why the agent stopped in the chat response
      // instead of just silence.
      const diagnostic = buildStopDiagnostic(_result, resolvedModel)
      if (diagnostic) {
        console.warn('[claude-code] stop diagnostic:', diagnostic)
        sink.emit(createProviderProgressEvent({
          provider: 'claude-code',
          status: 'streaming',
          message: diagnostic,
          timestamp: Date.now(),
          session: sessionRef,
        }))
      }

      sink.emit(createProviderProgressEvent({
        provider: 'claude-code',
        status: 'completed',
        message: diagnostic ?? 'Response complete',
        timestamp: Date.now(),
        session: sessionRef,
        tokenUsage: hasTokenUsage ? { inputTokens: inputTokens!, outputTokens: outputTokens! } : undefined,
        costUsd: typeof costUsd === 'number' ? costUsd : undefined,
        durationMs: typeof durationMs === 'number' ? durationMs : undefined,
      }))
    },
    (error) => {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[claude-code] process failed:', errorMsg)
      if (error instanceof Error && error.stack) console.error('[claude-code] stack:', error.stack)
      activeProcesses.delete(context.taskId)
      activeAgentPtySessions.delete(context.taskId)
      // Clean up any temp image files written for this invocation
      void cleanupTempFiles(invocationTempPaths)

      // Emit a visible diagnostic so the user sees the failure reason in chat
      sink.emit(createProviderProgressEvent({
        provider: 'claude-code',
        status: 'streaming',
        message: `\n\n---\n**Agent stopped** — process error: ${errorMsg}`,
        timestamp: Date.now(),
        session: sessionRef,
      }))

      sink.emit(createProviderProgressEvent({
        provider: 'claude-code',
        status: 'failed',
        message: errorMsg,
        timestamp: Date.now(),
        session: sessionRef,
      }))
    },
  )

  // Attach linkedTerminalId to the session reference BEFORE emitting events
  // so it propagates through the orchestration layer to the chat bridge.
  if (linkedTerminalId) {
    sessionRef.linkedTerminalId = linkedTerminalId
  }

  // Emit a status-only event so the bridge knows the session is live.
  const submittedAt = Date.now()
  sink.emit(createProviderProgressEvent({
    provider: 'claude-code',
    status: 'queued',
    message: linkedTerminalId
      ? `Claude Code PTY session started (terminal: ${linkedTerminalId})`
      : 'Claude Code session started',
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
    // If we have a concrete session ID, resume that session; otherwise use --continue
    const hasSessionId = !!context.providerSession?.sessionId
    return launchClaude(context, sink, hasSessionId ? context.providerSession!.sessionId : undefined)
  }

  async cancelTask(session: { requestId?: string; sessionId?: string; externalTaskId?: string }): Promise<void> {
    const targetId = session.externalTaskId ?? session.requestId ?? session.sessionId
    if (!targetId) return

    // Try PTY-backed session first (keyed by taskId)
    const agentPty = activeAgentPtySessions.get(targetId)
    if (agentPty) {
      agentPty.bridge.dispose()
      killPty(agentPty.ptySessionId)
      activeAgentPtySessions.delete(targetId)
      return
    }

    // Also check PTY sessions by iterating (targetId may match ptySessionId)
    for (const [key, entry] of activeAgentPtySessions) {
      if (entry.ptySessionId === targetId || key === targetId) {
        entry.bridge.dispose()
        killPty(entry.ptySessionId)
        activeAgentPtySessions.delete(key)
        return
      }
    }

    // Try headless process direct lookup (keyed by taskId)
    const handle = activeProcesses.get(targetId)
    if (handle) {
      handle.kill()
      activeProcesses.delete(targetId)
      return
    }

    // Also check by iterating (targetId may match sessionId)
    for (const [key, proc] of activeProcesses) {
      if (proc.sessionId === targetId || key === targetId) {
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
