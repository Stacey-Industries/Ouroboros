import type {
  ConversationMessage,
  OrchestrationMode,
  TaskRequest,
  TaskRequestContextSelection,
  TaskRequestMetadata,
} from '../orchestration/types'
import type { AgentChatThreadStore } from './threadStore'
import { DEFAULT_THREAD_TITLE, isNonEmptyString } from './threadStoreSupport'
import type {
  AgentChatContextSummary,
  AgentChatMessageRecord,
  AgentChatMessageSource,
  AgentChatSendMessageRequest,
  AgentChatSettings,
  AgentChatThreadRecord,
} from './types'

export interface ResolvedSendOptions {
  mode: OrchestrationMode
  provider: AgentChatSettings['defaultProvider']
  verificationProfile: AgentChatSettings['defaultVerificationProfile']
}

export interface PreparedSend {
  messageId: string
  requestedAt: number
  taskRequest: TaskRequest
  thread: AgentChatThreadRecord
}

const DEFAULT_MODE: OrchestrationMode = 'edit'
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
  return {
    id: args.messageId,
    threadId: args.threadId,
    role: 'user',
    content: args.content,
    createdAt: args.requestedAt,
    contextSummary: buildContextSummary(
      args.request.contextSelection,
      Boolean(args.request.metadata?.usedAdvancedControls),
    ),
  }
}

function buildConversationHistory(
  messages: AgentChatMessageRecord[],
  currentContent: string,
): ConversationMessage[] {
  // Include all messages except the current one (which is the last user message just appended).
  // The adapter receives `goal` as the current turn's user message; history is prior turns.
  const priorMessages = messages.slice(0, -1)
  return priorMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

function buildTaskRequest(args: {
  content: string
  request: AgentChatSendMessageRequest
  requestedAt: number
  resolved: ResolvedSendOptions
  thread: AgentChatThreadRecord
}): TaskRequest {
  return {
    workspaceRoots: [args.thread.workspaceRoot],
    goal: args.content,
    mode: args.resolved.mode,
    provider: args.resolved.provider,
    verificationProfile: args.resolved.verificationProfile,
    contextSelection: normalizeContextSelection(args.request.contextSelection),
    conversationHistory: buildConversationHistory(args.thread.messages, args.content),
    metadata: {
      origin: mapSourceToOrigin(args.request.metadata?.source),
      label: args.thread.title,
      requestedAt: args.requestedAt,
    },
  }
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
  settings: AgentChatSettings,
  request: AgentChatSendMessageRequest,
): ResolvedSendOptions {
  return {
    provider: request.overrides?.provider ?? settings.defaultProvider,
    verificationProfile: request.overrides?.verificationProfile ?? settings.defaultVerificationProfile,
    mode: request.overrides?.mode ?? DEFAULT_MODE,
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

  if (!isNonEmptyString(request.content)) {
    return 'Cannot send an empty chat message.'
  }

  return null
}
