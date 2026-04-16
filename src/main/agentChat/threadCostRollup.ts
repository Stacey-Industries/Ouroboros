/**
 * threadCostRollup.ts — Pure per-thread and global cost aggregation.
 *
 * Aggregates token usage from AgentChatMessageRecord arrays into
 * ThreadCostRollup values. No Electron imports — safe for any process.
 */

import { getPricing } from '@shared/pricing';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThreadCostRollup {
  threadId: string;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

export interface GlobalCostRollup {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  threadCount: number;
}

// ─── Per-thread rollup ────────────────────────────────────────────────────────

function aggregateMessage(
  acc: { inputTokens: number; outputTokens: number; totalUsd: number },
  message: AgentChatMessageRecord,
): void {
  const usage = message.tokenUsage;
  if (!usage) return;
  const { inputTokens, outputTokens } = usage;
  const pricing = getPricing(message.model);
  acc.inputTokens += inputTokens;
  acc.outputTokens += outputTokens;
  acc.totalUsd +=
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M;
}

export function computeThreadCostRollup(
  threadId: string,
  messages: AgentChatMessageRecord[],
): ThreadCostRollup {
  const acc = { inputTokens: 0, outputTokens: 0, totalUsd: 0 };
  for (const msg of messages) {
    aggregateMessage(acc, msg);
  }
  return { threadId, ...acc };
}

// ─── Global rollup ────────────────────────────────────────────────────────────

export function computeGlobalCostRollup(threads: ThreadCostRollup[]): GlobalCostRollup {
  let totalUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const t of threads) {
    totalUsd += t.totalUsd;
    totalInputTokens += t.inputTokens;
    totalOutputTokens += t.outputTokens;
  }
  return {
    totalUsd,
    totalInputTokens,
    totalOutputTokens,
    threadCount: threads.length,
  };
}

// ─── Convenience: rollup from a full thread record ────────────────────────────

export function rollupFromThread(thread: AgentChatThreadRecord): ThreadCostRollup {
  return computeThreadCostRollup(thread.id, thread.messages);
}
