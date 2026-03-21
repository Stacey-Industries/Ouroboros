import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { unlink,writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import type { ImageAttachment } from '../../agentChat/types'
import { type ClaudeCliSettings,getConfigValue } from '../../config'
import { resolveModelEnv } from '../../providers'
import { type AgentPtyResult,killPty, spawnAgentPty } from '../../pty'
import type { AgentBridgeHandle } from '../../ptyAgentBridge'
import { getModelBudgets } from '../contextPacketBuilderSupport'
import type { ContextPacket, ProviderCapabilities } from '../types'
import { spawnStreamJsonProcess } from './claudeStreamJsonRunner'
import {
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter'
import type { StreamJsonEvent, StreamJsonProcessHandle, StreamJsonResultEvent, StreamJsonToolUseBlock } from './streamJsonTypes'

/** Track active stream-json processes for cancellation. */
const activeProcesses = new Map<string, StreamJsonProcessHandle>()
/** Tasks that were cancelled by the user — suppresses error diagnostics in the exit handler. */
const cancelledTasks = new Set<string>()

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

  const result = sections.filter(Boolean).join('\n\n')

  // Append graph summary (hotspots + blast radius) outside the ide_context block
  // so it reads as a top-level context section rather than IDE state.
  if (packet.graphSummary) {
    return result + '\n\n' + packet.graphSummary
  }
  return result
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
 * Extract tool display metadata from a tool_use block's input.
 * Shared by the event handler for both running and completion events.
 */
function extractToolDisplayFields(block: StreamJsonToolUseBlock): {
  filePath?: string
  inputSummary?: string
  editSummary?: { oldLines: number; newLines: number }
} {
  const inp = block.input as Record<string, unknown> | undefined
  if (!inp) return {}
  const result: { filePath?: string; inputSummary?: string; editSummary?: { oldLines: number; newLines: number } } = {}
  const fp = inp.file_path ?? inp.filePath ?? inp.path
  if (typeof fp === 'string') result.filePath = fp
  if (typeof inp.command === 'string') {
    result.inputSummary = inp.command.length > 200 ? inp.command.slice(0, 197) + '...' : inp.command
  } else if (typeof inp.pattern === 'string') {
    result.inputSummary = `/${inp.pattern}/` + (typeof inp.glob === 'string' ? ` in ${inp.glob}` : '')
  } else if (typeof inp.description === 'string') {
    result.inputSummary = inp.description.length > 150 ? inp.description.slice(0, 147) + '...' : inp.description
  }
  if (typeof inp.old_string === 'string' && typeof inp.new_string === 'string') {
    result.editSummary = { oldLines: inp.old_string.split('\n').length, newLines: inp.new_string.split('\n').length }
  }
  return result
}

/**
 * Build the event handler callback shared by both PTY-backed and headless launches.
 *
 * Emits structured ProviderContentBlockDelta events that preserve block identity
 * (blockIndex) from the Claude API all the way to the renderer — no prefix-encoding,
 * no heuristic reconstruction downstream.
 *
 * Claude Code's stream-json format emits full message snapshots (not per-block deltas),
 * so we diff each event against the previous snapshot to compute per-block deltas.
 * Global block indices are maintained across multi-turn conversations.
 */
function buildEventHandler(
  sink: ProviderProgressSink,
  sessionRef: ReturnType<typeof createProviderSessionReference>,
): {
  handler: (event: StreamJsonEvent) => void
  getNextGlobalBlockIndex: () => number
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number }
} {
  // --- Per-block state tracking ---
  /** Global block index counter — increments across turns so each block has a unique position. */
  let nextGlobalBlockIndex = 0
  /** Maps local block index (within current turn) → global block index. */
  let localToGlobal: number[] = []
  /** Tracks emitted content length per global block index (for computing text/thinking deltas). */
  const emittedContentLengths = new Map<number, number>()
  /** Maps tool_use_id → { name, globalIndex } for emitting tool completion events. */
  const toolIdToGlobal = new Map<string, { name: string; globalIndex: number }>()
  /** Block types from the previous assistant event (for turn-boundary detection). */
  let prevBlockTypes: string[] = []

  // --- Token tracking ---
  let lastTurnInputTokens = 0
  let cumulativeOutputTokens = 0

  const handler = (event: StreamJsonEvent) => {
    if (event.type === 'assistant') {
      const blocks = event.message.content
      const now = Date.now()

      // --- Detect new turn ---
      // A new turn means the model received tool results and produced a fresh response.
      // The content array resets (different types at shared positions, or shrinks).
      let isNewTurn = false
      if (prevBlockTypes.length > 0) {
        if (blocks.length < prevBlockTypes.length) {
          isNewTurn = true
        } else {
          for (let i = 0; i < Math.min(blocks.length, prevBlockTypes.length); i++) {
            if (blocks[i].type !== prevBlockTypes[i]) {
              isNewTurn = true
              break
            }
          }
        }
      }

      if (isNewTurn) {
        // Complete all tracked tools from the previous turn
        for (const [, info] of toolIdToGlobal) {
          sink.emit({
            provider: 'claude-code',
            status: 'streaming',
            message: '',
            timestamp: now,
            session: sessionRef,
            contentBlock: {
              blockIndex: info.globalIndex,
              blockType: 'tool_use',
              toolActivity: { name: info.name, status: 'complete' },
            },
          })
        }
        toolIdToGlobal.clear()
        localToGlobal = []
      }

      // --- Assign global indices for any new blocks ---
      for (let i = localToGlobal.length; i < blocks.length; i++) {
        localToGlobal.push(nextGlobalBlockIndex++)
      }

      // --- Emit per-block deltas ---
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        const globalIdx = localToGlobal[i]

        if (block.type === 'text') {
          const prevLen = emittedContentLengths.get(globalIdx) ?? 0
          const delta = block.text.slice(prevLen)
          if (delta.length > 0) {
            sink.emit({
              provider: 'claude-code',
              status: 'streaming',
              message: delta,
              timestamp: now,
              session: sessionRef,
              contentBlock: {
                blockIndex: globalIdx,
                blockType: 'text',
                textDelta: delta,
              },
            })
            emittedContentLengths.set(globalIdx, block.text.length)
          }
        } else if (block.type === 'thinking' && block.thinking) {
          const prevLen = emittedContentLengths.get(globalIdx) ?? 0
          const delta = block.thinking.slice(prevLen)
          if (delta.length > 0) {
            sink.emit({
              provider: 'claude-code',
              status: 'streaming',
              message: '',
              timestamp: now,
              session: sessionRef,
              contentBlock: {
                blockIndex: globalIdx,
                blockType: 'thinking',
                textDelta: delta,
              },
            })
            emittedContentLengths.set(globalIdx, block.thinking.length)
          }
        } else if (block.type === 'tool_use') {
          if (!emittedContentLengths.has(globalIdx)) {
            const display = extractToolDisplayFields(block)
            sink.emit({
              provider: 'claude-code',
              status: 'streaming',
              message: '',
              timestamp: now,
              session: sessionRef,
              contentBlock: {
                blockIndex: globalIdx,
                blockType: 'tool_use',
                toolActivity: {
                  name: block.name,
                  status: 'running',
                  toolUseId: block.id,
                  filePath: display.filePath,
                  inputSummary: display.inputSummary,
                  editSummary: display.editSummary,
                },
              },
            })
            emittedContentLengths.set(globalIdx, 1)
            toolIdToGlobal.set(block.id, { name: block.name, globalIndex: globalIdx })
          }
        }
      }

      // Update turn-detection state
      prevBlockTypes = blocks.map((b) => b.type)

      // Track per-turn tokens: overwrite input (last turn's context), accumulate output.
      const usage = event.message.usage
      if (usage) {
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
    getNextGlobalBlockIndex: () => nextGlobalBlockIndex,
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
function _tryLaunchPtyBacked(args: {
  context: ProviderLaunchContext | ProviderResumeContext
  prompt: string
  cwd: string
  settings: ClaudeCliSettings
  sessionRef: ReturnType<typeof createProviderSessionReference>
  sink: ProviderProgressSink
  resumeSessionId?: string
  continueSession?: boolean
  effort?: string
  /** Extra env vars for provider routing (overrides slot-based env in PTY). */
  providerEnv?: Record<string, string>
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
    env: args.providerEnv,
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
  /** Extra env vars (e.g. provider routing: ANTHROPIC_BASE_URL, ANTHROPIC_MODEL). */
  providerEnv?: Record<string, string>
  /** Pre-built event handler — when provided, skips internal buildEventHandler call. */
  eventHandler?: (event: StreamJsonEvent) => void
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
    env: args.providerEnv,
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

  // Resolve provider env when model uses 'providerId:modelId' format.
  // Provider env sets ANTHROPIC_MODEL (+ base URL, auth) so we must NOT
  // also pass --model (which would conflict). Plain model strings go via --model as before.
  const providerEnv = resolvedModel?.includes(':') ? resolveModelEnv(resolvedModel) : {}
  const isProviderRouted = Object.keys(providerEnv).length > 0

  console.log('[claude-code] launchClaude called:', { cwd, model: resolvedModel, isProviderRouted, effort, permissionMode: resolvedPermissionMode, resumeSessionId: resumeSessionId || context.request.resumeFromSessionId })

  // Emit initial queued event
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Launching Claude Code session',
    timestamp: Date.now(),
  })

  const sessionRef = createProviderSessionReference('claude-code', {
    requestId,
    sessionId: 'providerSession' in context ? context.providerSession?.sessionId : undefined,
    externalTaskId: context.taskId,
  })

  // Build an effective settings object that applies per-request overrides.
  // This ensures the CLI --model and --permission-mode flags reflect what
  // the user picked in the chat controls, not just the global settings.
  // When provider-routed, model goes via ANTHROPIC_MODEL env var, not --model flag.
  const effectiveSettings: ClaudeCliSettings = {
    ...settings,
    model: isProviderRouted ? '' : (resolvedModel ?? ''),
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
  // TODO: PTY-linked terminal path was removed — re-enable when chat-terminal
  // unification lands. See AgentChatOrchestrationLink.linkedTerminalId.
  console.log('[claude-code] launching headless stream-json process', effectiveResumeSessionId ? `(resuming session ${effectiveResumeSessionId})` : '(new session)')

  // Create the event handler here so we can access cumulative usage in the completion handler.
  const { handler: eventHandler, getNextGlobalBlockIndex, getCumulativeUsage } = buildEventHandler(sink, sessionRef)

  // Materialize image attachments as temp files (async), then launch the process.
  // This runs in the background so the synchronous ProviderLaunchResult can be returned immediately.
  // Each invocation tracks its own temp paths to avoid a shared-closure race between concurrent calls.
  //
  // Register a deferred-kill placeholder immediately so that cancelTask can
  // find and terminate the process even while attachments are being materialized.
  // The placeholder is replaced with the real handle once launchHeadless runs.
  let deferredPid: number | undefined
  const placeholder: StreamJsonProcessHandle = {
    result: null as unknown as Promise<StreamJsonResultEvent>,
    kill: () => {
      // Kill the real process if it's been spawned, otherwise mark as cancelled
      if (deferredPid) {
        const handle = activeProcesses.get(context.taskId)
        if (handle && handle !== placeholder) {
          handle.kill()
          return
        }
      }
      // Mark as needing cancellation — launchHeadless will check this
      void placeholder.sessionId
    },
    pid: undefined,
    sessionId: null,
  }
  let cancelledBeforeLaunch = false
  placeholder.kill = () => {
    const realHandle = activeProcesses.get(context.taskId)
    if (realHandle && realHandle !== placeholder) {
      realHandle.kill()
    } else {
      cancelledBeforeLaunch = true
    }
  }
  activeProcesses.set(context.taskId, placeholder)

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
    // If cancel was requested during attachment materialization, bail out
    if (cancelledBeforeLaunch) {
      activeProcesses.delete(context.taskId)
      return null
    }
    const prompt = buildInitialPrompt(context, goalSuffix, Boolean(effectiveResumeSessionId), resolvedModel ?? '')
    const launchArgs = { context, prompt, cwd, settings: effectiveSettings, sessionRef, sink, resumeSessionId: effectiveResumeSessionId, continueSession, effort, providerEnv: isProviderRouted ? providerEnv : undefined }
    const headless = launchHeadless({ ...launchArgs, eventHandler })
    // Replace placeholder with real handle (launchHeadless already set it, but ensure consistency)
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
        const diagBlockIndex = getNextGlobalBlockIndex()
        sink.emit({
          provider: 'claude-code',
          status: 'streaming',
          message: diagnostic,
          timestamp: Date.now(),
          session: sessionRef,
          contentBlock: {
            blockIndex: diagBlockIndex,
            blockType: 'text',
            textDelta: diagnostic,
          },
        })
      }

      sink.emit({
        provider: 'claude-code',
        status: 'completed',
        message: diagnostic ?? 'Response complete',
        timestamp: Date.now(),
        session: sessionRef,
        tokenUsage: hasTokenUsage ? { inputTokens: inputTokens!, outputTokens: outputTokens! } : undefined,
        costUsd: typeof costUsd === 'number' ? costUsd : undefined,
        durationMs: typeof durationMs === 'number' ? durationMs : undefined,
      })
    },
    (error) => {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const wasCancelled = cancelledTasks.delete(context.taskId)
      activeProcesses.delete(context.taskId)
      activeAgentPtySessions.delete(context.taskId)
      // Clean up any temp image files written for this invocation
      void cleanupTempFiles(invocationTempPaths)

      if (wasCancelled) {
        // User-initiated stop — emit 'cancelled', not 'failed'. The bridge's
        // cancel handler will persist accumulated work and finalize the UI.
        console.log('[claude-code] process stopped by user')
        sink.emit({
          provider: 'claude-code',
          status: 'cancelled',
          message: 'Task cancelled by user',
          timestamp: Date.now(),
          session: sessionRef,
        })
        return
      }

      console.error('[claude-code] process failed:', errorMsg)
      if (error instanceof Error && error.stack) console.error('[claude-code] stack:', error.stack)

      // Emit a visible diagnostic so the user sees the failure reason in chat
      const errorDiagnostic = `\n\n---\n**Agent stopped** — process error: ${errorMsg}`
      sink.emit({
        provider: 'claude-code',
        status: 'streaming',
        message: errorDiagnostic,
        timestamp: Date.now(),
        session: sessionRef,
        contentBlock: {
          blockIndex: getNextGlobalBlockIndex(),
          blockType: 'text',
          textDelta: errorDiagnostic,
        },
      })

      sink.emit({
        provider: 'claude-code',
        status: 'failed',
        message: errorMsg,
        timestamp: Date.now(),
        session: sessionRef,
      })
    },
  )

  // Emit a status-only event so the bridge knows the session is live.
  const submittedAt = Date.now()
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Claude Code session started',
    timestamp: submittedAt,
    session: sessionRef,
  })

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
      cancelledTasks.add(targetId)
      handle.kill()
      activeProcesses.delete(targetId)
      return
    }

    // Also check by iterating (targetId may match sessionId)
    for (const [key, proc] of activeProcesses) {
      if (proc.sessionId === targetId || key === targetId) {
        cancelledTasks.add(key)
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
