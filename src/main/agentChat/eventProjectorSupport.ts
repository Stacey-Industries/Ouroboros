import type { TaskResult, TaskSessionRecord, VerificationSummary } from '../orchestration/types'
import type { AgentChatMessagePatch } from './threadStore'
import { buildAgentChatOrchestrationLink } from './chatOrchestrationBridgeSupport'
import {
  projectProviderFailureToAssistantMessage,
  projectProviderResultToAssistantMessage,
} from './responseProjector'
import type {
  AgentChatErrorPayload,
  AgentChatMessageRecord,
  AgentChatThreadRecord,
} from './types'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function buildProjectedMessageId(sessionId: string, kind: string): string {
  return `agent-chat:${sessionId}:${kind}`
}

function buildContextMessage(
  session: TaskSessionRecord,
  threadId: string,
): AgentChatMessageRecord | null {
  if (!session.contextPacket) {
    return null
  }

  const selectedFileCount = session.contextPacket.files.length
  const omittedFileCount = session.contextPacket.omittedCandidates.length
  const parts = [`Prepared context from ${pluralize(selectedFileCount, 'file')}`]
  if (omittedFileCount > 0) {
    parts.push(`${pluralize(omittedFileCount, 'candidate')} omitted from the final packet`)
  }

  return {
    id: buildProjectedMessageId(session.id, 'context'),
    threadId,
    role: 'status',
    content: `${parts.join(' with ')}.`,
    createdAt: session.contextPacket.createdAt,
    statusKind: 'context',
    orchestration: buildAgentChatOrchestrationLink(session),
  }
}

function buildProgressMessage(
  session: TaskSessionRecord,
  threadId: string,
): AgentChatMessageRecord | null {
  let content: string | null = null

  if (session.status === 'selecting_context') {
    content = 'Selecting workspace context for the current request.'
  } else if (session.status === 'awaiting_provider') {
    content = `Handing work to ${session.request.provider}.`
  } else if (session.status === 'applying') {
    content = 'Provider work is running and changes are being applied.'
  } else if (session.status === 'verifying') {
    content = `Running ${session.request.verificationProfile} verification.`
  } else if (session.status === 'paused') {
    content = 'Task is paused and can be resumed.'
  }

  if (!content) {
    return null
  }

  return {
    id: buildProjectedMessageId(session.id, 'progress'),
    threadId,
    role: 'status',
    content,
    createdAt: session.updatedAt,
    statusKind: 'progress',
    orchestration: buildAgentChatOrchestrationLink(session),
  }
}

function buildVerificationPreview(summary: VerificationSummary | undefined) {
  if (!summary) {
    return undefined
  }

  return {
    profile: summary.profile,
    status: summary.status,
    summary: summary.summary,
  } satisfies AgentChatMessageRecord['verificationPreview']
}

function buildVerificationContent(summary: VerificationSummary): string {
  if (summary.status === 'pending' || summary.status === 'running') {
    return `Running ${summary.profile} verification.`
  }
  if (summary.summary.trim()) {
    return summary.summary.trim()
  }
  return `${summary.profile} verification ${summary.status}.`
}

function buildVerificationMessage(
  session: TaskSessionRecord,
  threadId: string,
): AgentChatMessageRecord | null {
  const summary = session.lastVerificationSummary
  if (!summary) {
    return null
  }

  return {
    id: buildProjectedMessageId(session.id, 'verification'),
    threadId,
    role: 'status',
    content: buildVerificationContent(summary),
    createdAt: summary.completedAt ?? summary.startedAt,
    statusKind: 'verification',
    orchestration: buildAgentChatOrchestrationLink(session),
    verificationPreview: buildVerificationPreview(summary),
  }
}

function buildResultError(result: TaskResult): AgentChatErrorPayload | undefined {
  if (result.status !== 'failed') {
    return undefined
  }

  const detail = result.unresolvedIssues.find((issue) => issue.trim().length > 0)
  return {
    code: 'orchestration_failed',
    message: detail ?? result.message?.trim() ?? 'The orchestration task failed.',
    recoverable: true,
  }
}

function buildResultContent(result: TaskResult): string {
  if (result.message?.trim()) {
    return result.message.trim()
  }
  if (result.status === 'complete') {
    return 'Task completed successfully.'
  }
  if (result.status === 'needs_review') {
    return 'Task finished and needs review.'
  }
  if (result.status === 'failed') {
    return 'Task failed.'
  }
  if (result.status === 'cancelled') {
    return 'Task was cancelled.'
  }
  if (result.status === 'paused') {
    return 'Task was paused.'
  }
  return `Task status: ${result.status}.`
}

function buildResultMessage(
  session: TaskSessionRecord,
  threadId: string,
): AgentChatMessageRecord | null {
  const result = session.latestResult
  if (!result) {
    return null
  }

  return {
    id: buildProjectedMessageId(session.id, 'result'),
    threadId,
    role: 'status',
    content: buildResultContent(result),
    createdAt: session.updatedAt,
    statusKind: result.status === 'failed' ? 'error' : 'result',
    orchestration: buildAgentChatOrchestrationLink(session),
    verificationPreview: buildVerificationPreview(result.verificationSummary ?? session.lastVerificationSummary),
    error: buildResultError(result),
  }
}

export function linksEqual(
  left: AgentChatThreadRecord['latestOrchestration'],
  right: AgentChatThreadRecord['latestOrchestration'],
): boolean {
  return left?.taskId === right?.taskId
    && left?.sessionId === right?.sessionId
    && left?.attemptId === right?.attemptId
}

function extractResponseText(session: TaskSessionRecord): string {
  const latestAttempt = session.attempts.at(-1)
  return latestAttempt?.providerArtifact?.lastMessage
    ?? latestAttempt?.resultMessage
    ?? session.latestResult?.message
    ?? ''
}

function extractDuration(session: TaskSessionRecord): number | undefined {
  const latestAttempt = session.attempts.at(-1)
  if (latestAttempt?.startedAt && latestAttempt?.completedAt) {
    return latestAttempt.completedAt - latestAttempt.startedAt
  }
  return undefined
}

const TERMINAL_STATUSES = new Set(['complete', 'failed', 'cancelled'])

function buildAssistantMessage(
  session: TaskSessionRecord,
  threadId: string,
): AgentChatMessageRecord | null {
  if (!TERMINAL_STATUSES.has(session.status)) {
    return null
  }

  const messageId = buildProjectedMessageId(session.id, 'assistant')
  const link = buildAgentChatOrchestrationLink(session)

  if (session.status === 'failed' || session.status === 'cancelled') {
    const errorDetail = session.latestResult?.unresolvedIssues?.find((issue) => issue.trim().length > 0)
    const errorMessage = errorDetail
      ?? session.latestResult?.message?.trim()
      ?? (session.status === 'cancelled' ? 'Task was cancelled.' : 'Task failed.')

    return projectProviderFailureToAssistantMessage({
      threadId,
      messageId,
      errorMessage,
      orchestrationLink: link,
      timestamp: session.updatedAt,
    })
  }

  return projectProviderResultToAssistantMessage({
    threadId,
    messageId,
    responseText: extractResponseText(session),
    orchestrationLink: link,
    durationMs: extractDuration(session),
    timestamp: session.updatedAt,
  })
}

export function buildProjectedMessages(session: TaskSessionRecord, threadId: string): AgentChatMessageRecord[] {
  return [
    buildContextMessage(session, threadId),
    buildProgressMessage(session, threadId),
    buildVerificationMessage(session, threadId),
    buildResultMessage(session, threadId),
    buildAssistantMessage(session, threadId),
  ].filter((message): message is AgentChatMessageRecord => message !== null)
}

export function toComparableMessage(message: AgentChatMessageRecord) {
  return {
    role: message.role,
    content: message.content,
    statusKind: message.statusKind,
    orchestration: message.orchestration,
    contextSummary: message.contextSummary,
    verificationPreview: message.verificationPreview,
    error: message.error,
    toolsSummary: message.toolsSummary,
    costSummary: message.costSummary,
    durationSummary: message.durationSummary,
  }
}

export function messagePatchFromRecord(message: AgentChatMessageRecord): AgentChatMessagePatch {
  return {
    role: message.role,
    content: message.content,
    statusKind: message.statusKind,
    orchestration: message.orchestration,
    contextSummary: message.contextSummary,
    verificationPreview: message.verificationPreview,
    error: message.error,
    toolsSummary: message.toolsSummary,
    costSummary: message.costSummary,
    durationSummary: message.durationSummary,
  }
}
