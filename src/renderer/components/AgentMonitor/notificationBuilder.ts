/**
 * notificationBuilder.ts — Builds rich desktop notification messages from agent sessions.
 *
 * Pure function: takes an AgentSession, returns { title, body } for the system notification.
 * Includes duration, cost, tool count, and error info when available.
 */

import { estimateCost, formatCost } from './costCalculator';
import type { AgentSession } from './types';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function buildNotificationParts(session: AgentSession): string[] {
  const parts: string[] = [];
  const label =
    session.taskLabel.length > 60 ? session.taskLabel.slice(0, 60) + '\u2026' : session.taskLabel;
  parts.push(label);
  if (session.completedAt && session.startedAt) {
    parts.push(formatDuration(session.completedAt - session.startedAt));
  }
  const cost = estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  });
  if (cost.totalCost > 0) parts.push(formatCost(cost.totalCost));
  const toolCount = session.toolCalls.length;
  if (toolCount > 0) parts.push(`${toolCount} tool call${toolCount !== 1 ? 's' : ''}`);
  if (session.status === 'error' && session.error)
    parts.push(`Error: ${session.error.slice(0, 80)}`);
  return parts;
}

export function buildCompletionNotification(session: AgentSession): {
  title: string;
  body: string;
} {
  const isError = session.status === 'error';
  const title = isError ? 'Agent error' : 'Agent completed';
  return { title, body: buildNotificationParts(session).join(' \u2022 ') };
}
