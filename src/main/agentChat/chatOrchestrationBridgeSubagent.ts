/**
 * chatOrchestrationBridgeSubagent.ts — Synthetic agent_start / agent_end emitters
 * for Task-tool child sessions spawned in the chat path.
 *
 * Gated on `agentMonitor.subagentDisplay.enabled` (default false).
 * When the flag is off this module is a pure no-op — zero behaviour change.
 *
 * Wave 57 Phase C.
 */

import { getConfigValue } from '../config';
import { dispatchSyntheticHookEvent } from '../hooks';
import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';
import { traceLink } from './subagentLinkTrace';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskBlock {
  toolCallId: string;
}

type EndStatus = 'success' | 'error' | 'cancelled';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isSubagentEmissionEnabled(): boolean {
  const monitor = getConfigValue('agentMonitor');
  return monitor?.subagentDisplay?.enabled === true;
}

function mintChildSessionId(threadId: string, toolCallId: string): string {
  return `chat-sub:${threadId}:${toolCallId}`;
}

function getOrCreateEntry(
  ctx: ActiveStreamContext,
  toolCallId: string,
): { started: boolean; ended: boolean } {
  const existing = ctx.chatSubagentEmissions.get(toolCallId);
  if (existing) return existing;
  const entry = { started: false, ended: false };
  ctx.chatSubagentEmissions.set(toolCallId, entry);
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit a synthetic `agent_start` for a Task-tool child session.
 * No-op when the `agentMonitor.subagentDisplay.enabled` flag is false.
 * Idempotent: repeated calls with the same toolCallId are silently ignored.
 */
export function emitChatSubagentStart(ctx: ActiveStreamContext, taskBlock: TaskBlock): void {
  if (!isSubagentEmissionEnabled()) return;

  const entry = getOrCreateEntry(ctx, taskBlock.toolCallId);
  if (entry.started) return;
  entry.started = true;

  const childSessionId = mintChildSessionId(ctx.threadId, taskBlock.toolCallId);
  dispatchSyntheticHookEvent({
    type: 'agent_start',
    sessionId: childSessionId,
    parentSessionId: ctx.threadId,
    taskLabel: 'Task (subagent)',
    timestamp: Date.now(),
  });

  traceLink('chat:subagentStart', {
    parentSessionId: ctx.threadId,
    childSessionId,
    toolCallId: taskBlock.toolCallId,
    source: 'chat-bridge',
    timestamp: Date.now(),
  });
}

/**
 * Emit a synthetic `agent_end` for a Task-tool child session.
 * No-op when the `agentMonitor.subagentDisplay.enabled` flag is false.
 * Idempotent: repeated calls with the same toolCallId are silently ignored.
 */
export function emitChatSubagentEnd(
  ctx: ActiveStreamContext,
  taskBlock: TaskBlock,
  status: EndStatus,
): void {
  if (!isSubagentEmissionEnabled()) return;

  const entry = getOrCreateEntry(ctx, taskBlock.toolCallId);
  if (entry.ended) return;
  entry.ended = true;

  const childSessionId = mintChildSessionId(ctx.threadId, taskBlock.toolCallId);
  const endPayload = {
    type: 'agent_end' as const,
    sessionId: childSessionId,
    timestamp: Date.now(),
    data: { stop_reason: status },
  };
  dispatchSyntheticHookEvent(endPayload);

  traceLink('chat:subagentEnd', {
    parentSessionId: ctx.threadId,
    childSessionId,
    toolCallId: taskBlock.toolCallId,
    source: 'chat-bridge',
    timestamp: Date.now(),
  });
}

/**
 * Close all Task-tool child sessions that were started but not yet ended.
 * Called when the parent stream terminates (cancelled, failed, or stream reset).
 * No-op when the flag is off.
 */
export function closeOpenSubagents(ctx: ActiveStreamContext, status: EndStatus): void {
  if (!isSubagentEmissionEnabled()) return;
  for (const [toolCallId, entry] of ctx.chatSubagentEmissions) {
    if (entry.started && !entry.ended) {
      emitChatSubagentEnd(ctx, { toolCallId }, status);
    }
  }
}
