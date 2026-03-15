import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
} from './types'

export interface ProjectAssistantMessageArgs {
  threadId: string
  messageId: string
  responseText: string
  toolsUsed?: Array<{ name: string; input?: unknown }>
  orchestrationLink?: AgentChatOrchestrationLink
  costUsd?: number
  durationMs?: number
  timestamp: number
}

export interface ProjectFailureMessageArgs {
  threadId: string
  messageId: string
  errorMessage: string
  orchestrationLink?: AgentChatOrchestrationLink
  timestamp: number
}

export function formatToolsSummary(tools: Array<{ name: string; input?: unknown }>): string {
  if (tools.length === 0) return ''

  const uniqueNames = [...new Set(tools.map((t) => t.name))]
  const total = tools.length
  const maxDisplay = 5

  if (uniqueNames.length <= maxDisplay) {
    return `Used ${total} tool${total === 1 ? '' : 's'}: ${uniqueNames.join(', ')}`
  }

  const displayed = uniqueNames.slice(0, maxDisplay)
  const remaining = uniqueNames.length - maxDisplay
  return `Used ${total} tool${total === 1 ? '' : 's'}: ${displayed.join(', ')} and ${remaining} more`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s'
  if (ms < 60000) {
    const seconds = Math.round(ms / 1000)
    return `${seconds}s`
  }

  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`
}

export function projectProviderResultToAssistantMessage(
  args: ProjectAssistantMessageArgs,
): AgentChatMessageRecord {
  const message: AgentChatMessageRecord = {
    id: args.messageId,
    threadId: args.threadId,
    role: 'assistant',
    content: args.responseText || '(No response)',
    createdAt: args.timestamp,
  }

  if (args.orchestrationLink) {
    message.orchestration = args.orchestrationLink
  }

  if (args.toolsUsed && args.toolsUsed.length > 0) {
    message.toolsSummary = formatToolsSummary(args.toolsUsed)
  }

  if (args.costUsd != null) {
    message.costSummary = formatCost(args.costUsd)
  }

  if (args.durationMs != null) {
    message.durationSummary = formatDuration(args.durationMs)
  }

  return message
}

export function projectProviderFailureToAssistantMessage(
  args: ProjectFailureMessageArgs,
): AgentChatMessageRecord {
  return {
    id: args.messageId,
    threadId: args.threadId,
    role: 'assistant',
    content: '',
    createdAt: args.timestamp,
    orchestration: args.orchestrationLink,
    error: {
      code: 'orchestration_failed',
      message: args.errorMessage,
      recoverable: true,
    },
  }
}
