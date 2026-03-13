import { useEffect, useMemo, useState } from 'react';
import type { AgentSession } from '../AgentMonitor/types';
import { estimateCost } from '../AgentMonitor/costCalculator';

export interface BatchStats {
  completed: number;
  total: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface GridLayout {
  columns: number;
  rows: number;
}

function matchBatchSessionIds(agents: AgentSession[], batchLabels: string[]): string[] {
  const sortedAgents = [...agents].sort((left, right) => right.startedAt - left.startedAt);
  const usedIds = new Set<string>();
  const matched: string[] = [];

  for (const label of batchLabels) {
    const match = sortedAgents.find((agent) => agent.taskLabel === label && !usedIds.has(agent.id));
    if (!match) continue;
    usedIds.add(match.id);
    matched.push(match.id);
  }

  return matched;
}

function haveSameIds(previous: string[], next: string[]): boolean {
  const nextIds = new Set(next);
  return previous.length === next.length && previous.every((id) => nextIds.has(id));
}

function resolveBatchSessions(
  agents: AgentSession[],
  batchLabels: string[],
  batchSessionIds: string[],
): Array<AgentSession | null> {
  return batchLabels.map((_, index) => {
    const sessionId = batchSessionIds[index];
    return sessionId ? agents.find((agent) => agent.id === sessionId) ?? null : null;
  });
}

function isResolvedSession(session: AgentSession | null): session is AgentSession {
  return session !== null;
}

export function estimateSessionCost(session: AgentSession): number {
  return estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  }).totalCost;
}

function buildBatchStats(batchSessions: Array<AgentSession | null>, total: number): BatchStats {
  const resolved = batchSessions.filter(isResolvedSession);
  return {
    completed: resolved.filter((session) => session.status === 'complete' || session.status === 'error').length,
    total,
    totalInputTokens: resolved.reduce((sum, session) => sum + session.inputTokens, 0),
    totalOutputTokens: resolved.reduce((sum, session) => sum + session.outputTokens, 0),
    totalCost: resolved.reduce((sum, session) => sum + estimateSessionCost(session), 0),
  };
}

export function getGridLayout(sessionCount: number): GridLayout {
  return {
    columns: sessionCount <= 2 ? sessionCount : 2,
    rows: sessionCount <= 2 ? 1 : 2,
  };
}

export function useMultiSessionMonitorModel(
  agents: AgentSession[],
  batchLabels: string[],
): {
  batchSessions: Array<AgentSession | null>;
  gridLayout: GridLayout;
  stats: BatchStats;
} {
  const [batchSessionIds, setBatchSessionIds] = useState<string[]>([]);

  useEffect(() => {
    const matched = matchBatchSessionIds(agents, batchLabels);
    setBatchSessionIds((previous) => (haveSameIds(previous, matched) ? previous : matched));
  }, [agents, batchLabels]);

  const batchSessions = useMemo(
    () => resolveBatchSessions(agents, batchLabels, batchSessionIds),
    [agents, batchLabels, batchSessionIds],
  );
  const gridLayout = useMemo(() => getGridLayout(batchLabels.length), [batchLabels.length]);
  const stats = useMemo(() => buildBatchStats(batchSessions, batchLabels.length), [batchSessions, batchLabels.length]);

  return { batchSessions, gridLayout, stats };
}
