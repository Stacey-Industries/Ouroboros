/**
 * chatOrchestrationHistorySupport.ts — Conversation history building and compaction helpers.
 *
 * Extracted from chatOrchestrationRequestSupport.ts to keep file line counts under the ESLint limit.
 */

import type { ConversationMessage } from '../orchestration/types';
import { computeAdaptiveBudgets } from './adaptiveBudget';
import {
  buildInlineSummary,
  COMPACTION_THRESHOLD,
  KEEP_RECENT_TURNS,
} from './conversationCompactor';
import { tokenCalibrationStore } from './tokenCalibration';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ---------------------------------------------------------------------------
// Budget helpers
// ---------------------------------------------------------------------------

interface HistoryBudgets {
  historyTokenBudget: number;
  assistantMaxChars: number;
  assistantTruncationKeep: number;
  contextPacketMaxTokens?: number;
}

/** Returns token budgets scaled to the model's context window. */
function getHistoryBudgets(model: string): HistoryBudgets {
  const isOpus = model.includes('opus');
  if (isOpus) {
    return {
      historyTokenBudget: 250_000,
      assistantMaxChars: 60_000,
      assistantTruncationKeep: 59_000,
    };
  }
  return { historyTokenBudget: 64_000, assistantMaxChars: 16_000, assistantTruncationKeep: 15_500 };
}

/**
 * Compute adaptive budgets with fallback to static budgets on error.
 * Returns both history budgets and an optional context packet token cap.
 */
export function getAdaptiveBudgets(model: string, thread?: AgentChatThreadRecord): HistoryBudgets {
  try {
    const turnNumber = (thread?.turnCount ?? Math.ceil((thread?.messages.length ?? 0) / 2)) || 1;
    const adaptive = computeAdaptiveBudgets({
      model,
      turnNumber,
      lastContextPacketTokens: 0,
      lastHistoryTokens: 0,
    });
    return {
      historyTokenBudget: adaptive.historyTokenBudget,
      assistantMaxChars: adaptive.assistantMaxChars,
      assistantTruncationKeep: adaptive.assistantTruncationKeep,
      contextPacketMaxTokens: adaptive.contextPacketMaxTokens,
    };
  } catch (err) {
    console.warn('[agentChat] adaptive budget failed, using static fallback:', err);
    return getHistoryBudgets(model);
  }
}

export function truncateAssistantContent(
  content: string,
  maxChars: number,
  keepChars: number,
): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, keepChars)}...(truncated)`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ---------------------------------------------------------------------------
// Compaction helpers
// ---------------------------------------------------------------------------

function getPreviousCompactionCount(messages: ConversationMessage[]): number {
  const first = messages[0];
  if (!first?.content.startsWith('[Conversation Compacted')) return 0;
  return parseInt(first.content.match(/Summary #(\d+)/)?.[1] ?? '0', 10);
}

function sumTokens(messages: ConversationMessage[]): number {
  return messages.reduce(
    (sum, msg) => sum + tokenCalibrationStore.calibrate(estimateTokens(msg.content)),
    0,
  );
}

/**
 * Attempt inline compaction of older messages.
 * Returns the compacted history on success, or undefined if compaction should be skipped.
 */
function tryCompact(
  filtered: ConversationMessage[],
  budgets: HistoryBudgets,
  thread: AgentChatThreadRecord | undefined,
): ConversationMessage[] | undefined {
  const keepCount = Math.min(filtered.length, KEEP_RECENT_TURNS * 2);
  const splitPoint = filtered.length - keepCount;
  const toCompact = filtered.slice(0, splitPoint);
  const toKeep = filtered.slice(splitPoint);

  if (toCompact.length === 0) return undefined;

  const previousCompactionCount = getPreviousCompactionCount(toCompact);
  const compactedTokens = sumTokens(toCompact);
  const summaryText = buildInlineSummary(toCompact, previousCompactionCount, compactedTokens);

  if (thread) {
    thread.compactionCount = previousCompactionCount + 1;
  }

  const keptTokens =
    tokenCalibrationStore.calibrate(estimateTokens(summaryText)) + sumTokens(toKeep);
  if (keptTokens > budgets.historyTokenBudget) return undefined;

  return [{ role: 'user', content: summaryText }, ...toKeep];
}

/**
 * Fallback drop-oldest: keep the most recent messages that fit within the token budget.
 */
function dropOldestToFit(
  filtered: ConversationMessage[],
  budgets: HistoryBudgets,
): ConversationMessage[] {
  let fallbackTokens = 0;
  let startIndex = filtered.length;
  for (let i = filtered.length - 1; i >= 0; i--) {
    // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
    const msgTokens = tokenCalibrationStore.calibrate(estimateTokens(filtered[i].content));
    if (fallbackTokens + msgTokens > budgets.historyTokenBudget) break;
    fallbackTokens += msgTokens;
    startIndex = i;
  }

  const kept = filtered.slice(startIndex);
  if (startIndex > 0 && kept.length > 0) {
    kept.unshift({
      role: 'user',
      content: '(Earlier conversation messages were condensed to stay within context limits)',
    });
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build conversation history for a task request, applying compaction if needed.
 */
export function buildConversationHistory(
  messages: AgentChatMessageRecord[],
  model: string,
  thread?: AgentChatThreadRecord,
): ConversationMessage[] {
  const budgets = getAdaptiveBudgets(model, thread);

  // Exclude the last message (the current user turn being sent now).
  const priorMessages = messages.slice(0, -1);
  const filtered = priorMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content?.trim())
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content:
        m.role === 'assistant'
          ? truncateAssistantContent(
              m.content,
              budgets.assistantMaxChars,
              budgets.assistantTruncationKeep,
            )
          : m.content,
    }));

  const totalTokens = sumTokens(filtered);
  const compactionBudget = budgets.historyTokenBudget * COMPACTION_THRESHOLD;

  if (totalTokens <= compactionBudget) return filtered;

  try {
    const compacted = tryCompact(filtered, budgets, thread);
    if (compacted) return compacted;
  } catch (err) {
    console.warn('[agentChat] Compaction failed, falling back to message dropping:', err);
  }

  return dropOldestToFit(filtered, budgets);
}
