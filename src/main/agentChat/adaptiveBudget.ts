/**
 * Adaptive context budgeting — dynamically allocates token budget between
 * conversation history and context packets based on turn number and actual
 * usage from previous turns.
 */

const OUTPUT_RESERVE = 16_000
const SYSTEM_OVERHEAD = 20_000
const MIN_HISTORY_BUDGET = 8_000
const MIN_CONTEXT_BUDGET = 5_000

function getModelContextLimit(model: string): number {
  if (model.includes('opus')) return 1_000_000
  if (model.includes('sonnet')) return 200_000
  if (model.includes('codex')) return 128_000
  return 128_000
}

function getTurnPhaseRatios(turnNumber: number): { context: number; history: number } {
  if (turnNumber <= 3) return { context: 0.6, history: 0.4 }
  if (turnNumber <= 10) return { context: 0.45, history: 0.55 }
  return { context: 0.3, history: 0.7 }
}

export interface AdaptiveBudgetParams {
  model: string
  turnNumber: number
  /** Actual context packet tokens from last turn (0 if first turn) */
  lastContextPacketTokens: number
  /** Actual history tokens from last turn (0 if first turn) */
  lastHistoryTokens: number
}

export interface AdaptiveBudgetResult {
  historyTokenBudget: number
  contextPacketMaxTokens: number
  assistantMaxChars: number
  assistantTruncationKeep: number
  totalBudget: number
}

export function computeAdaptiveBudgets(params: AdaptiveBudgetParams): AdaptiveBudgetResult {
  const { model, turnNumber, lastContextPacketTokens } = params
  const contextLimit = getModelContextLimit(model)
  const flexBudget = contextLimit - OUTPUT_RESERVE - SYSTEM_OVERHEAD

  const ratios = getTurnPhaseRatios(turnNumber)
  const defaultContextAllocation = Math.floor(flexBudget * ratios.context)
  const defaultHistoryAllocation = Math.floor(flexBudget * ratios.history)

  let contextBudget: number
  let historyBudget: number

  if (lastContextPacketTokens > 0) {
    // We have actuals — allocate 20% headroom over actual usage, give rest to history
    contextBudget = Math.max(MIN_CONTEXT_BUDGET, Math.ceil(lastContextPacketTokens * 1.2))
    historyBudget = Math.max(MIN_HISTORY_BUDGET, flexBudget - contextBudget)
  } else {
    // No actuals yet — use phase-based defaults
    contextBudget = Math.max(MIN_CONTEXT_BUDGET, defaultContextAllocation)
    historyBudget = Math.max(MIN_HISTORY_BUDGET, defaultHistoryAllocation)
  }

  // Clamp total to flex budget
  if (contextBudget + historyBudget > flexBudget) {
    const scale = flexBudget / (contextBudget + historyBudget)
    contextBudget = Math.max(MIN_CONTEXT_BUDGET, Math.floor(contextBudget * scale))
    historyBudget = Math.max(MIN_HISTORY_BUDGET, Math.floor(historyBudget * scale))
  }

  const assistantMaxChars = Math.min(80_000, Math.max(8_000, Math.floor(historyBudget * 0.25)))
  const assistantTruncationKeep = assistantMaxChars - 500

  return {
    historyTokenBudget: historyBudget,
    contextPacketMaxTokens: contextBudget,
    assistantMaxChars,
    assistantTruncationKeep,
    totalBudget: flexBudget,
  }
}
