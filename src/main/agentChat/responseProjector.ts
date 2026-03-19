import type {
  AgentChatContentBlock,
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
  tokenUsage?: { inputTokens: number; outputTokens: number }
  /** Model ID used for this message (e.g. 'claude-opus-4-6'). */
  model?: string
  timestamp: number
  /** Structured content blocks captured during streaming (tool cards, thinking, text) */
  blocks?: import('./types').AgentChatContentBlock[]
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

/**
 * Merge adjacent text blocks into a single block at persistence time.
 *
 * "Adjacent" means only separated by transparent blocks (tool_use, tool_result,
 * thinking) which are common during streaming. Structural blocks (code, diff,
 * plan, error) break the merge because they represent distinct visual sections.
 *
 * Separator heuristic:
 * - If the previous text ends with a sentence-terminal character (.!?:)]) plus
 *   optional trailing whitespace, join with a paragraph break (\n\n).
 * - Otherwise join with a single space (mid-sentence continuation).
 */
export function mergeAdjacentTextBlocks(blocks: AgentChatContentBlock[]): AgentChatContentBlock[] {
  if (!blocks || blocks.length === 0) return []

  // Kinds that do NOT break a text merge — they pass through transparently.
  // Only thinking is transparent: the model's internal reasoning doesn't
  // represent a visible break in the output. Tool calls ARE a break — text
  // before and after tools must stay separate so the renderer can interleave
  // them at the correct positions between tool groups.
  const transparentKinds = new Set<AgentChatContentBlock['kind']>([
    'thinking',
  ])

  const merged: AgentChatContentBlock[] = []
  // Index into `merged` of the last text block we can still append to.
  let lastTextIdx = -1

  for (const block of blocks) {
    if (block.kind === 'text') {
      if (lastTextIdx >= 0) {
        // Merge into the previous text block.
        const prev = merged[lastTextIdx] as { kind: 'text'; content: string }
        const endsClean = /[.!?:)\]]\s*$/.test(prev.content)
        prev.content += (endsClean ? '\n\n' : ' ') + block.content
      } else {
        // First text block — start a new run.
        merged.push({ ...block })
        lastTextIdx = merged.length - 1
      }
    } else if (transparentKinds.has(block.kind)) {
      // Transparent block — keep it in the output but don't break the merge.
      merged.push({ ...block })
    } else {
      // Structural block (code, diff, plan, error) — break the merge.
      merged.push({ ...block })
      lastTextIdx = -1
    }
  }

  return merged
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

  if (args.tokenUsage) {
    message.tokenUsage = args.tokenUsage
  }

  if (args.model) {
    message.model = args.model
  }

  if (args.blocks && args.blocks.length > 0) {
    // Seal any tool blocks still marked 'running' as 'complete'
    const sealed = args.blocks.map((block) =>
      block.kind === 'tool_use' && block.status === 'running'
        ? { ...block, status: 'complete' as const }
        : block,
    )
    // Merge text blocks separated only by thinking (transparent) into single
    // blocks so markdown syntax spanning across thinking pauses stays intact.
    // Tool calls break the merge — text before/after tools stays separate.
    message.blocks = mergeAdjacentTextBlocks(sealed)
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
