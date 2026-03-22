import type {
  ConversationMessage,
  OrchestrationMode,
  TaskRequest,
  TaskRequestContextSelection,
  TaskRequestMetadata,
} from '../orchestration/types'
import type { ModelSlotAssignments } from '../config'
import { getConfigValue } from '../config'
import type { AgentChatThreadStore } from './threadStore'
import { DEFAULT_THREAD_TITLE, isNonEmptyString } from './threadStoreSupport'
import type { ResolvedAgentChatSettings } from './settingsResolver'
import type {
  AgentChatContextSummary,
  AgentChatMessageRecord,
  AgentChatMessageSource,
  AgentChatSendMessageRequest,
  AgentChatSettings,
  AgentChatThreadRecord,
} from './types'
import { tokenCalibrationStore } from './tokenCalibration'
import { buildInlineSummary, COMPACTION_THRESHOLD, KEEP_RECENT_TURNS } from './conversationCompactor'
import { computeAdaptiveBudgets } from './adaptiveBudget'

export interface ResolvedSendOptions {
  mode: OrchestrationMode
  provider: AgentChatSettings['defaultProvider']
  verificationProfile: AgentChatSettings['defaultVerificationProfile']
  /** Model identifier (e.g. 'claude-opus-4-6'). Empty string means provider default. */
  model: string
  /** Effort level ('low' | 'medium' | 'high' | 'max'). Empty string means default. */
  effort: string
  /** Permission mode ('default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'). */
  permissionMode: string
}

export interface PreparedSend {
  messageId: string
  requestedAt: number
  taskRequest: TaskRequest
  thread: AgentChatThreadRecord
}

const DEFAULT_MODE: OrchestrationMode = 'edit'
const DEFAULT_CHAT_EFFORT = 'medium'
const TITLE_MAX_LENGTH = 80

function uniqueStrings(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!isNonEmptyString(value)) continue
    const normalized = value.trim()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function hasExplicitContextSelection(selection: Partial<TaskRequestContextSelection> | undefined): boolean {
  if (!selection) return false

  return uniqueStrings(selection.userSelectedFiles).length > 0
    || uniqueStrings(selection.pinnedFiles).length > 0
    || uniqueStrings(selection.includedFiles).length > 0
    || uniqueStrings(selection.excludedFiles).length > 0
}

function normalizeContextSelection(
  selection: Partial<TaskRequestContextSelection> | undefined,
): Partial<TaskRequestContextSelection> | undefined {
  if (!selection || !hasExplicitContextSelection(selection)) return undefined

  return {
    userSelectedFiles: uniqueStrings(selection.userSelectedFiles),
    pinnedFiles: uniqueStrings(selection.pinnedFiles),
    includedFiles: uniqueStrings(selection.includedFiles),
    excludedFiles: uniqueStrings(selection.excludedFiles),
  }
}

function countSelectedFiles(selection: Partial<TaskRequestContextSelection> | undefined): number {
  if (!selection) return 0

  return new Set([
    ...(selection.userSelectedFiles ?? []),
    ...(selection.pinnedFiles ?? []),
    ...(selection.includedFiles ?? []),
  ]).size
}

function countExcludedFiles(selection: Partial<TaskRequestContextSelection> | undefined): number {
  return selection?.excludedFiles?.length ?? 0
}

function buildContextSummary(
  selection: Partial<TaskRequestContextSelection> | undefined,
  usedAdvancedControls: boolean,
): AgentChatContextSummary | undefined {
  const normalizedSelection = normalizeContextSelection(selection)
  if (!normalizedSelection && !usedAdvancedControls) return undefined

  return {
    selectedFileCount: countSelectedFiles(normalizedSelection),
    omittedFileCount: countExcludedFiles(normalizedSelection),
    usedAdvancedControls,
  }
}

function buildThreadTitle(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return DEFAULT_THREAD_TITLE
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine
  return `${firstLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
}

// ---------------------------------------------------------------------------
// Smart title generation — derives a concise title from the first response
// ---------------------------------------------------------------------------

import path from 'path'

const EDIT_TOOLS = new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit', 'Write', 'write_file', 'create_file', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read', 'read_file'])
const SEARCH_TOOLS = new Set(['Grep', 'search_files', 'Glob', 'find_files'])
const BASH_TOOLS = new Set(['Bash', 'execute_command'])

/**
 * Generates a smarter thread title from the first assistant response and tool activity.
 *
 * Strategy:
 * 1. If edits were made: "{action} — {primary file}" e.g. "Fix auth — middleware.ts"
 * 2. If only reads/searches: "Explore — {file or pattern}"
 * 3. If no tools: Extract first meaningful phrase from response text
 * 4. Fallback: Keep original prompt-based title
 */
export function deriveSmartTitle(args: {
  userPrompt: string
  responseText: string
  toolsUsed: Array<{ name: string; filePath?: string }>
}): string | null {
  const { toolsUsed, responseText, userPrompt } = args

  // Classify tools
  const editFiles: string[] = []
  const readFiles: string[] = []
  let hasSearch = false
  let hasBash = false

  for (const tool of toolsUsed) {
    const basename = tool.filePath ? path.basename(tool.filePath) : undefined
    if (EDIT_TOOLS.has(tool.name) && basename) {
      if (!editFiles.includes(basename)) editFiles.push(basename)
    } else if (READ_TOOLS.has(tool.name) && basename) {
      if (!readFiles.includes(basename)) readFiles.push(basename)
    } else if (SEARCH_TOOLS.has(tool.name)) {
      hasSearch = true
    } else if (BASH_TOOLS.has(tool.name)) {
      hasBash = true
    }
  }

  // Extract action verb from user prompt
  const actionVerb = extractActionVerb(userPrompt)

  // Strategy 1: Edits were made
  if (editFiles.length > 0) {
    const fileLabel = editFiles.length <= 2
      ? editFiles.join(', ')
      : `${editFiles[0]} +${editFiles.length - 1} more`
    const verb = actionVerb || 'Update'
    const title = `${verb} — ${fileLabel}`
    return title.length <= TITLE_MAX_LENGTH ? title : `${title.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
  }

  // Strategy 2: Reads/searches (exploration task)
  if (readFiles.length > 0 || hasSearch) {
    const fileLabel = readFiles.length > 0
      ? (readFiles.length <= 2 ? readFiles.join(', ') : `${readFiles.length} files`)
      : 'codebase'
    const verb = actionVerb || 'Explore'
    const title = `${verb} — ${fileLabel}`
    return title.length <= TITLE_MAX_LENGTH ? title : `${title.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
  }

  // Strategy 3: Bash only
  if (hasBash) {
    const verb = actionVerb || 'Run commands'
    return verb
  }

  // Strategy 4: No tools — extract from response text
  if (responseText.length > 20) {
    const firstSentence = responseText
      .split(/[.!?\n]/)
      .map((s) => s.trim())
      .find((s) => s.length > 10 && s.length < 80)
    if (firstSentence) {
      return firstSentence.length <= TITLE_MAX_LENGTH
        ? firstSentence
        : `${firstSentence.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
    }
  }

  // No improvement possible
  return null
}

/**
 * Extracts a short action verb/phrase from the user prompt.
 * Looks for imperative verbs at the start or common patterns.
 */
function extractActionVerb(prompt: string): string | null {
  const normalized = prompt.trim()
  // Common imperative patterns at start of prompt
  const verbMatch = normalized.match(
    /^(fix|add|update|refactor|remove|delete|create|implement|move|rename|debug|optimize|improve|clean\s*up|set\s*up|configure|install|migrate|convert|replace|merge|split|extract|rewrite|simplify|test|document)\b(.{0,40}?)(?:\s+(?:in|for|from|to|the|this|my|our|a|an)\b|$)/i,
  )
  if (verbMatch) {
    // Capitalize first letter
    const phrase = (verbMatch[1] + verbMatch[2]).trim()
    const capitalized = phrase.charAt(0).toUpperCase() + phrase.slice(1)
    return capitalized.length <= 40 ? capitalized : capitalized.slice(0, 37).trimEnd() + '...'
  }
  return null
}

// ---------------------------------------------------------------------------
// LLM-generated title (Option B) — async upgrade via Haiku
// ---------------------------------------------------------------------------

/**
 * Calls Claude Haiku to generate a concise, descriptive thread title.
 * Returns null on any failure so the heuristic title stays.
 *
 * This is deliberately fire-and-forget — it upgrades the title asynchronously
 * after the heuristic has already been set, so there's no user-visible delay.
 */
export async function generateLlmTitle(args: {
  userPrompt: string
  responseText: string
  toolsUsed: Array<{ name: string; filePath?: string }>
}): Promise<string | null> {
  try {
    const { createAnthropicClient } = await import('../orchestration/providers/anthropicAuth')
    const client = await createAnthropicClient()

    // Build a compact summary of what happened
    const toolSummary = args.toolsUsed.length > 0
      ? `Tools used: ${[...new Set(args.toolsUsed.map((t) => t.name))].join(', ')}. Files: ${[...new Set(args.toolsUsed.map((t) => t.filePath).filter(Boolean))].slice(0, 5).join(', ') || 'none'}.`
      : ''

    const responsePreview = args.responseText.length > 600
      ? args.responseText.slice(0, 600) + '...'
      : args.responseText

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      messages: [{
        role: 'user',
        content: `Generate a concise title (4-8 words, no quotes, no period) for this coding conversation.

User request: ${args.userPrompt.slice(0, 300)}

${toolSummary}

Assistant response (excerpt): ${responsePreview}

Title:`,
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null
    if (!text || text.length < 3 || text.length > TITLE_MAX_LENGTH) return null

    // Strip quotes/periods the model might add despite instructions
    return text.replace(/^["']+|["'.]+$/g, '').trim() || null
  } catch (error) {
    console.warn('[agentChat] LLM title generation failed (heuristic title preserved):', error instanceof Error ? error.message : error)
    return null
  }
}

function mapSourceToOrigin(source: AgentChatMessageSource | undefined): TaskRequestMetadata['origin'] {
  if (source === 'resume') return 'resume'
  if (source === 'api') return 'api'
  return 'panel'
}

function createUserMessage(args: {
  content: string
  messageId: string
  request: AgentChatSendMessageRequest
  requestedAt: number
  threadId: string
}): AgentChatMessageRecord {
  let content = args.content
  if (args.request.attachments && args.request.attachments.length > 0) {
    const names = args.request.attachments.map((a) => a.name).join(', ')
    content = content ? `${content}\n[Attached: ${names}]` : `[Attached: ${names}]`
  }
  return {
    id: args.messageId,
    threadId: args.threadId,
    role: 'user',
    content,
    createdAt: args.requestedAt,
    contextSummary: buildContextSummary(
      args.request.contextSelection,
      Boolean(args.request.metadata?.usedAdvancedControls),
    ),
  }
}

// ---------------------------------------------------------------------------
// Model-aware history budgets
// ---------------------------------------------------------------------------

/** Returns token budgets scaled to the model's context window. */
function getHistoryBudgets(model: string): {
  historyTokenBudget: number
  assistantMaxChars: number
  assistantTruncationKeep: number
} {
  const isOpus = model.includes('opus')
  if (isOpus) {
    // Opus: 1M context — allocate generously for history
    return { historyTokenBudget: 250_000, assistantMaxChars: 60_000, assistantTruncationKeep: 59_000 }
  }
  // Sonnet/Haiku: 200K context
  return { historyTokenBudget: 64_000, assistantMaxChars: 16_000, assistantTruncationKeep: 15_500 }
}

/**
 * Compute adaptive budgets with fallback to static budgets on error.
 * Returns both history budgets and an optional context packet token cap.
 */
function getAdaptiveBudgets(model: string, thread?: AgentChatThreadRecord): {
  historyTokenBudget: number
  assistantMaxChars: number
  assistantTruncationKeep: number
  contextPacketMaxTokens?: number
} {
  try {
    const turnNumber = (thread?.turnCount ?? Math.ceil((thread?.messages.length ?? 0) / 2)) || 1
    // We don't have direct access to the actual packet tokens here, so we pass 0
    // and let the adaptive budget use phase-based defaults on first turns.
    const adaptive = computeAdaptiveBudgets({
      model,
      turnNumber,
      lastContextPacketTokens: 0,
      lastHistoryTokens: 0,
    })
    return {
      historyTokenBudget: adaptive.historyTokenBudget,
      assistantMaxChars: adaptive.assistantMaxChars,
      assistantTruncationKeep: adaptive.assistantTruncationKeep,
      contextPacketMaxTokens: adaptive.contextPacketMaxTokens,
    }
  } catch (err) {
    console.warn('[agentChat] adaptive budget failed, using static fallback:', err)
    return getHistoryBudgets(model)
  }
}

function truncateAssistantContent(content: string, maxChars: number, keepChars: number): string {
  if (content.length <= maxChars) return content
  return `${content.slice(0, keepChars)}...(truncated)`
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

function buildConversationHistory(
  messages: AgentChatMessageRecord[],
  currentContent: string,
  model: string,
  thread?: AgentChatThreadRecord,
): ConversationMessage[] {
  const budgets = getAdaptiveBudgets(model, thread)

  // Include all messages except the current one (which is the last user message just appended).
  // The adapter receives `goal` as the current turn's user message; history is prior turns.
  const priorMessages = messages.slice(0, -1)
  const filtered = priorMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content?.trim())
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'assistant'
        ? truncateAssistantContent(m.content, budgets.assistantMaxChars, budgets.assistantTruncationKeep)
        : m.content,
    }))

  // Estimate total tokens across all filtered messages.
  let totalTokens = 0
  for (const msg of filtered) {
    totalTokens += tokenCalibrationStore.calibrate(estimateTokens(msg.content))
  }

  const compactionBudget = budgets.historyTokenBudget * COMPACTION_THRESHOLD

  // If within budget, return everything as-is.
  if (totalTokens <= compactionBudget) return filtered

  // --- Compaction needed ---
  try {
    // Split into "to compact" (older) and "to keep" (recent turns).
    // Each turn is a user+assistant pair; KEEP_RECENT_TURNS pairs = 2x messages.
    const keepCount = Math.min(filtered.length, KEEP_RECENT_TURNS * 2)
    const splitPoint = filtered.length - keepCount
    const toCompact = filtered.slice(0, splitPoint)
    const toKeep = filtered.slice(splitPoint)

    if (toCompact.length === 0) return filtered

    // Check if we already have a compaction summary as the first message.
    const previousCompactionCount =
      toCompact[0].content.startsWith('[Conversation Compacted')
        ? parseInt(toCompact[0].content.match(/Summary #(\d+)/)?.[1] ?? '0', 10)
        : 0

    // Estimate tokens in the messages being dropped.
    let compactedTokens = 0
    for (const msg of toCompact) {
      compactedTokens += tokenCalibrationStore.calibrate(estimateTokens(msg.content))
    }

    const summaryText = buildInlineSummary(toCompact, previousCompactionCount, compactedTokens)

    // Track compaction count on the thread (fire-and-forget, never block send path).
    if (thread) {
      thread.compactionCount = previousCompactionCount + 1
    }

    // Verify the kept messages + summary fit within the full budget.
    // If they don't, fall through to the legacy drop-oldest approach below.
    let keptTokens = tokenCalibrationStore.calibrate(estimateTokens(summaryText))
    for (const msg of toKeep) {
      keptTokens += tokenCalibrationStore.calibrate(estimateTokens(msg.content))
    }

    if (keptTokens <= budgets.historyTokenBudget) {
      return [{ role: 'user', content: summaryText }, ...toKeep]
    }
  } catch (err) {
    console.warn('[agentChat] Compaction failed, falling back to message dropping:', err)
  }

  // Fallback: keep the most recent messages that fit within the token budget, dropping oldest first.
  let fallbackTokens = 0
  let startIndex = filtered.length
  for (let i = filtered.length - 1; i >= 0; i--) {
    const msgTokens = tokenCalibrationStore.calibrate(estimateTokens(filtered[i].content))
    if (fallbackTokens + msgTokens > budgets.historyTokenBudget) break
    fallbackTokens += msgTokens
    startIndex = i
  }

  const kept = filtered.slice(startIndex)

  if (startIndex > 0 && kept.length > 0) {
    kept.unshift({
      role: 'user',
      content: '(Earlier conversation messages were condensed to stay within context limits)',
    })
  }

  return kept
}

/**
 * Check if the model changed since the last session — any model change invalidates
 * --resume because thinking block signatures are model-specific.
 *
 * Priority: orchestration link model (set even when stopped early) > last assistant message model.
 * Returns true (= don't resume) when the previous model is unknown and a session exists.
 */
function didModelChange(thread: AgentChatThreadRecord, currentModel: string): boolean {
  // Best source: model stored on the orchestration link (survives early stops)
  const linkModel = thread.latestOrchestration?.model
  if (linkModel) return linkModel !== currentModel

  // Fallback: last assistant message's model (pre-migration threads)
  const lastAssistant = [...thread.messages].reverse().find(m => m.role === 'assistant' && m.model)
  if (lastAssistant?.model) return lastAssistant.model !== currentModel

  // No model info at all — if we have a session ID, assume it's stale (safe default)
  return !!(thread.latestOrchestration?.claudeSessionId || thread.latestOrchestration?.codexThreadId)
}

function getResumeSessionId(
  thread: AgentChatThreadRecord,
  provider: TaskRequest['provider'],
): string | undefined {
  if (provider === 'codex') {
    return thread.latestOrchestration?.codexThreadId
  }
  return thread.latestOrchestration?.claudeSessionId
}

function buildTaskRequest(args: {
  content: string
  request: AgentChatSendMessageRequest
  requestedAt: number
  resolved: ResolvedSendOptions
  thread: AgentChatThreadRecord
}): TaskRequest {
  const resumeSessionId = getResumeSessionId(args.thread, args.resolved.provider)
  const currentModel = args.resolved.model || ''

  // Don't resume a session when the model changed — thinking block signatures
  // are model-specific and will be rejected by the API.
  const modelChanged = didModelChange(args.thread, currentModel)
  const canResume = resumeSessionId && !modelChanged

  // Increment turn count for adaptive budget tracking
  args.thread.turnCount = (args.thread.turnCount ?? 0) + 1

  // Compute adaptive budgets — the context packet cap flows to the builder via TaskRequest.budget
  const adaptiveBudgets = getAdaptiveBudgets(currentModel, args.thread)

  const taskRequest: TaskRequest = {
    workspaceRoots: [args.thread.workspaceRoot],
    goal: args.content,
    mode: args.resolved.mode,
    provider: args.resolved.provider,
    verificationProfile: args.resolved.verificationProfile,
    model: currentModel || undefined,
    effort: args.resolved.effort || undefined,
    permissionMode: args.resolved.permissionMode !== 'default' ? args.resolved.permissionMode : undefined,
    contextSelection: normalizeContextSelection(args.request.contextSelection),
    conversationHistory: canResume
      ? []
      : buildConversationHistory(args.thread.messages, args.content, currentModel, args.thread),
    resumeFromSessionId: canResume ? resumeSessionId : undefined,
    goalAttachments: args.request.attachments?.length ? args.request.attachments : undefined,
    metadata: {
      origin: mapSourceToOrigin(args.request.metadata?.source),
      label: args.thread.title,
      requestedAt: args.requestedAt,
    },
  }

  // Pass adaptive context budget cap to the context packet builder.
  // Only set when adaptive budgets computed a cap — the builder uses its own
  // model-based defaults when budget.maxTokens is absent.
  if (adaptiveBudgets.contextPacketMaxTokens) {
    taskRequest.budget = {
      ...taskRequest.budget,
      maxTokens: adaptiveBudgets.contextPacketMaxTokens,
    }
  }

  return taskRequest
}

async function resolveThreadForSend(args: {
  content: string
  request: AgentChatSendMessageRequest
  threadStore: AgentChatThreadStore
}): Promise<AgentChatThreadRecord> {
  const { content, request, threadStore } = args

  if (isNonEmptyString(request.threadId)) {
    const thread = await threadStore.loadThread(request.threadId)
    if (!thread) throw new Error(`Chat thread not found: ${request.threadId}`)
    if (thread.workspaceRoot !== request.workspaceRoot) {
      throw new Error(`Chat thread ${request.threadId} does not belong to ${request.workspaceRoot}`)
    }
    return thread
  }

  return threadStore.createThread({
    workspaceRoot: request.workspaceRoot,
    title: buildThreadTitle(content),
  })
}

export function resolveSendOptions(
  settings: ResolvedAgentChatSettings,
  request: AgentChatSendMessageRequest,
): ResolvedSendOptions {
  // Use agentChat model slot as fallback when no per-message override is given.
  // This lets users set a default provider:model for all agent chat sessions.
  const slots = getConfigValue('modelSlots') as ModelSlotAssignments | undefined
  const slotDefault = slots?.agentChat || ''

  return {
    provider: request.overrides?.provider ?? settings.defaultProvider,
    verificationProfile: request.overrides?.verificationProfile ?? settings.defaultVerificationProfile,
    mode: request.overrides?.mode ?? DEFAULT_MODE,
    model: request.overrides?.model || slotDefault || settings.claudeCliSettings.model,
    effort: request.overrides?.effort || DEFAULT_CHAT_EFFORT,
    permissionMode: request.overrides?.permissionMode || settings.claudeCliSettings.permissionMode || 'default',
  }
}

export async function preparePendingSend(args: {
  content: string
  createId: () => string
  now: () => number
  request: AgentChatSendMessageRequest
  resolved: ResolvedSendOptions
  threadStore: AgentChatThreadStore
}): Promise<PreparedSend> {
  const requestedAt = args.now()
  let thread = await resolveThreadForSend({
    content: args.content,
    request: args.request,
    threadStore: args.threadStore,
  })

  const messageId = args.createId()
  const message = createUserMessage({
    content: args.content,
    messageId,
    request: args.request,
    requestedAt,
    threadId: thread.id,
  })

  thread = await args.threadStore.appendMessage(thread.id, message)
  thread = await args.threadStore.updateThread(thread.id, { status: 'submitting' })

  return {
    messageId,
    requestedAt,
    taskRequest: buildTaskRequest({
      content: args.content,
      request: args.request,
      requestedAt,
      resolved: args.resolved,
      thread,
    }),
    thread,
  }
}

export function validateSendRequest(request: AgentChatSendMessageRequest): string | null {
  if (!isNonEmptyString(request.workspaceRoot)) {
    return 'A workspace root is required to send a chat message.'
  }

  if (!isNonEmptyString(request.content) && !(request.attachments?.length)) {
    return 'Cannot send an empty chat message.'
  }

  if (request.attachments) {
    const MAX_SIZE = 5 * 1024 * 1024
    for (const att of request.attachments) {
      if (att.sizeBytes > MAX_SIZE) {
        return `Attachment "${att.name}" exceeds the 5 MB limit.`
      }
    }
    if (request.attachments.length > 5) {
      return 'You can attach at most 5 images per message.'
    }
  }

  return null
}
