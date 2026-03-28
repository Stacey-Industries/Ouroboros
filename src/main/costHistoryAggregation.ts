/**
 * costHistoryAggregation.ts — Aggregation functions over CostEntry[] from SQLite.
 *
 * Replaces the JSONL-based usageReaderSupport.ts logic for the Usage page.
 * All functions are pure (no I/O) — callers fetch data via getCostHistory().
 */

import { getPricing } from '@shared/pricing';

import type { CostEntry } from './costHistory';

// ─── Re-exported types (must match electron-observability.d.ts) ──────────────

export interface SessionUsage {
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  messageCount: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  sessionCount: number;
  messageCount: number;
}

export interface UsageSummary {
  sessions: SessionUsage[];
  totals: UsageTotals;
}

export interface SessionMessageUsage {
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SessionDetailTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
  messageCount: number;
  durationMs: number;
}

export interface SessionDetail {
  sessionId: string;
  messages: SessionMessageUsage[];
  totals: SessionDetailTotals;
}

export interface WindowedUsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface WindowedUsage {
  fiveHour: WindowedUsageBucket & { windowStart: number };
  weekly: WindowedUsageBucket & { windowStart: number };
  sonnetFiveHour: WindowedUsageBucket;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_COST_MODEL = 'claude-sonnet-4';

// ─── Internal helpers ────────────────────────────────────────────────────────

function sumTokens(
  entries: CostEntry[],
): Pick<CostEntry, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'> {
  return entries.reduce(
    (acc, e) => {
      acc.inputTokens += e.inputTokens;
      acc.outputTokens += e.outputTokens;
      acc.cacheReadTokens += e.cacheReadTokens;
      acc.cacheWriteTokens += e.cacheWriteTokens;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}

function computeTotalTokens(
  tokens: Pick<CostEntry, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>,
): number {
  return tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
}

function computeWindowCost(
  tokens: Pick<CostEntry, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>,
  model: string,
): number {
  const p = getPricing(model);
  return (
    (tokens.inputTokens / 1_000_000) * p.inputPer1M +
    (tokens.outputTokens / 1_000_000) * p.outputPer1M +
    (tokens.cacheReadTokens / 1_000_000) * p.cacheReadPer1M +
    (tokens.cacheWriteTokens / 1_000_000) * p.cacheWritePer1M
  );
}

function entryToSessionUsage(entry: CostEntry): SessionUsage {
  return {
    sessionId: entry.sessionId,
    startedAt: entry.timestamp,
    lastActiveAt: entry.timestamp,
    model: entry.model,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    cacheWriteTokens: entry.cacheWriteTokens,
    estimatedCost: entry.estimatedCost,
    messageCount: 1,
  };
}

function buildUsageTotals(sessions: SessionUsage[]): UsageTotals {
  const totals: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    sessionCount: sessions.length,
    messageCount: sessions.length,
  };
  for (const s of sessions) {
    totals.inputTokens += s.inputTokens;
    totals.outputTokens += s.outputTokens;
    totals.cacheReadTokens += s.cacheReadTokens;
    totals.cacheWriteTokens += s.cacheWriteTokens;
    totals.estimatedCost += s.estimatedCost;
  }
  return totals;
}

function buildWindowBucket(
  entries: CostEntry[],
  model: string,
): WindowedUsageBucket {
  const tokens = sumTokens(entries);
  return {
    ...tokens,
    totalTokens: computeTotalTokens(tokens),
    estimatedCost: computeWindowCost(tokens, model),
  };
}

function entryToSessionDetail(entry: CostEntry): SessionDetail {
  const totalTokens = computeTotalTokens(entry);
  return {
    sessionId: entry.sessionId,
    messages: [
      {
        timestamp: entry.timestamp,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
      },
    ],
    totals: {
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cacheWriteTokens: entry.cacheWriteTokens,
      totalTokens,
      estimatedCost: entry.estimatedCost,
      model: entry.model,
      messageCount: 1,
      durationMs: 0,
    },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Aggregate a filtered set of cost entries into a UsageSummary.
 * Entries are filtered by `options.since` (ms timestamp) if provided.
 */
export function aggregateUsageSummary(
  entries: CostEntry[],
  options?: { since?: number; maxSessions?: number },
): UsageSummary {
  const { since, maxSessions } = options ?? {};
  let filtered = since ? entries.filter((e) => e.timestamp >= since) : entries;
  if (maxSessions !== undefined) {
    filtered = filtered.slice(0, maxSessions);
  }
  const sessions = filtered.map(entryToSessionUsage);
  return { sessions, totals: buildUsageTotals(sessions) };
}

/**
 * Compute windowed usage buckets (5-hour, weekly, Sonnet 5-hour) from entries.
 */
export function aggregateWindowedUsage(entries: CostEntry[]): WindowedUsage {
  const now = Date.now();
  const fiveHourStart = now - FIVE_HOUR_MS;
  const weekStart = now - WEEK_MS;

  const weekEntries = entries.filter((e) => e.timestamp >= weekStart);
  const fiveHourEntries = entries.filter((e) => e.timestamp >= fiveHourStart);
  const sonnetEntries = fiveHourEntries.filter((e) =>
    e.model.toLowerCase().includes('sonnet'),
  );

  return {
    fiveHour: {
      ...buildWindowBucket(fiveHourEntries, WINDOW_COST_MODEL),
      windowStart: fiveHourStart,
    },
    weekly: {
      ...buildWindowBucket(weekEntries, WINDOW_COST_MODEL),
      windowStart: weekStart,
    },
    sonnetFiveHour: buildWindowBucket(sonnetEntries, WINDOW_COST_MODEL),
  };
}

/**
 * Return the most recent `count` sessions as SessionDetail objects.
 * Entries are assumed to be pre-sorted by timestamp DESC (as returned by getCostHistory).
 */
export function getRecentSessionsFromEntries(
  entries: CostEntry[],
  count: number,
): SessionDetail[] {
  return entries.slice(0, count).map(entryToSessionDetail);
}

/**
 * Find a single entry by sessionId and return it as a SessionDetail.
 * Returns null if not found.
 */
export function findSessionDetailById(
  entries: CostEntry[],
  sessionId: string,
): SessionDetail | null {
  const entry = entries.find((e) => e.sessionId === sessionId);
  return entry ? entryToSessionDetail(entry) : null;
}
