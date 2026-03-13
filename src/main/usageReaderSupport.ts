import { getPricing } from '@shared/pricing'

export interface UsageEntry {
  sessionId: string
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface SessionUsage {
  sessionId: string
  startedAt: number
  lastActiveAt: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  messageCount: number
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  sessionCount: number
  messageCount: number
}

export interface UsageSummary {
  sessions: SessionUsage[]
  totals: UsageTotals
}

export interface SessionMessageUsage {
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface SessionDetailTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  estimatedCost: number
  model: string
  messageCount: number
  durationMs: number
}

export interface SessionDetail {
  sessionId: string
  messages: SessionMessageUsage[]
  totals: SessionDetailTotals
}

export interface WindowUsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface WindowUsageBucketWithStart extends WindowUsageBucket {
  windowStart: number
}

export interface WindowedUsage {
  fiveHour: WindowUsageBucketWithStart
  weekly: WindowUsageBucketWithStart
  sonnetFiveHour: WindowUsageBucket
}

export interface WindowUsageTotals {
  fiveHour: UsageTokenTotals
  weekly: UsageTokenTotals
  sonnetFiveHour: UsageTokenTotals
}

export interface SessionFile {
  path: string
  mtime: number
}

export interface ParsedUsageLine {
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface UsageTokenTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface CostEstimateEntry extends UsageTokenTotals {
  model: string
}

interface EntryAggregate extends UsageTokenTotals {
  model: string
  startedAt: number
  lastActiveAt: number
}

const UNKNOWN_MODEL = 'unknown'

export function estimateCost(entry: CostEstimateEntry): number {
  const pricing = getPricing(entry.model)
  return (
    (entry.inputTokens / 1_000_000) * pricing.inputPer1M +
    (entry.outputTokens / 1_000_000) * pricing.outputPer1M +
    (entry.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M +
    (entry.cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M
  )
}

export function createTokenTotals(): UsageTokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

export function addEntryTokens(
  target: UsageTokenTotals,
  entry: UsageTokenTotals
): void {
  target.inputTokens += entry.inputTokens
  target.outputTokens += entry.outputTokens
  target.cacheReadTokens += entry.cacheReadTokens
  target.cacheWriteTokens += entry.cacheWriteTokens
}

export function createWindowUsageTotals(): WindowUsageTotals {
  return {
    fiveHour: createTokenTotals(),
    weekly: createTokenTotals(),
    sonnetFiveHour: createTokenTotals(),
  }
}

function getTotalTokens(totals: UsageTokenTotals): number {
  return (
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheReadTokens +
    totals.cacheWriteTokens
  )
}

function buildAggregate(entries: ParsedUsageLine[]): EntryAggregate | null {
  if (entries.length === 0) {
    return null
  }

  const aggregate: EntryAggregate = {
    ...createTokenTotals(),
    model: UNKNOWN_MODEL,
    startedAt: Number.POSITIVE_INFINITY,
    lastActiveAt: 0,
  }

  for (const entry of entries) {
    addEntryTokens(aggregate, entry)
    aggregate.model = entry.model
    aggregate.startedAt = Math.min(aggregate.startedAt, entry.timestamp)
    aggregate.lastActiveAt = Math.max(aggregate.lastActiveAt, entry.timestamp)
  }

  return aggregate
}

export function buildSessionUsage(
  sessionId: string,
  entries: ParsedUsageLine[]
): SessionUsage | null {
  const aggregate = buildAggregate(entries)
  if (!aggregate) {
    return null
  }

  return {
    sessionId,
    startedAt: aggregate.startedAt,
    lastActiveAt: aggregate.lastActiveAt,
    model: aggregate.model,
    inputTokens: aggregate.inputTokens,
    outputTokens: aggregate.outputTokens,
    cacheReadTokens: aggregate.cacheReadTokens,
    cacheWriteTokens: aggregate.cacheWriteTokens,
    estimatedCost: estimateCost(aggregate),
    messageCount: entries.length,
  }
}

export function buildUsageTotals(sessions: SessionUsage[]): UsageTotals {
  const totals: UsageTotals = {
    ...createTokenTotals(),
    estimatedCost: 0,
    sessionCount: sessions.length,
    messageCount: 0,
  }

  for (const session of sessions) {
    addEntryTokens(totals, session)
    totals.estimatedCost += session.estimatedCost
    totals.messageCount += session.messageCount
  }

  return totals
}

function buildMessages(entries: ParsedUsageLine[]): SessionMessageUsage[] {
  return entries.map((entry) => ({
    timestamp: entry.timestamp,
    model: entry.model,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    cacheWriteTokens: entry.cacheWriteTokens,
  }))
}

function buildEmptySessionDetail(sessionId: string): SessionDetail {
  return {
    sessionId,
    messages: [],
    totals: {
      ...createTokenTotals(),
      totalTokens: 0,
      estimatedCost: 0,
      model: UNKNOWN_MODEL,
      messageCount: 0,
      durationMs: 0,
    },
  }
}

export function buildSessionDetail(
  sessionId: string,
  entries: ParsedUsageLine[]
): SessionDetail {
  const aggregate = buildAggregate(entries)
  if (!aggregate) {
    return buildEmptySessionDetail(sessionId)
  }

  return {
    sessionId,
    messages: buildMessages(entries),
    totals: {
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      cacheReadTokens: aggregate.cacheReadTokens,
      cacheWriteTokens: aggregate.cacheWriteTokens,
      totalTokens: getTotalTokens(aggregate),
      estimatedCost: estimateCost(aggregate),
      model: aggregate.model,
      messageCount: entries.length,
      durationMs:
        aggregate.lastActiveAt > aggregate.startedAt
          ? aggregate.lastActiveAt - aggregate.startedAt
          : 0,
    },
  }
}

export function buildWindowUsageBucket(
  totals: UsageTokenTotals,
  model: string
): WindowUsageBucket {
  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cacheReadTokens: totals.cacheReadTokens,
    cacheWriteTokens: totals.cacheWriteTokens,
    totalTokens: getTotalTokens(totals),
    estimatedCost: estimateCost({ ...totals, model }),
  }
}

export function buildWindowUsageBucketWithStart(
  totals: UsageTokenTotals,
  model: string,
  windowStart: number
): WindowUsageBucketWithStart {
  return {
    ...buildWindowUsageBucket(totals, model),
    windowStart,
  }
}

export function addWindowUsageEntry(
  totals: WindowUsageTotals,
  entry: ParsedUsageLine,
  weekStart: number,
  fiveHourStart: number
): void {
  if (entry.timestamp >= weekStart) {
    addEntryTokens(totals.weekly, entry)
  }

  if (entry.timestamp < fiveHourStart) {
    return
  }

  addEntryTokens(totals.fiveHour, entry)
  if (entry.model.toLowerCase().includes('sonnet')) {
    addEntryTokens(totals.sonnetFiveHour, entry)
  }
}
