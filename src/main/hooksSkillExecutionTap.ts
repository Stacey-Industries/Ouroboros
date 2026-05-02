/**
 * hooksSkillExecutionTap.ts — Hook pipeline tap for skill execution accumulation.
 *
 * Detects skill invocations (agent_start with taskLabel starting with "/")
 * and accumulates SkillExecutionRecord entries on the matching ActiveStreamContext
 * so they are persisted alongside the completed assistant message.
 *
 * Called from dispatchToRenderer (before suppression guard) and from
 * dispatchSyntheticHookEvent in hooks.ts so skill sub-agent events are captured
 * regardless of suppression state.
 */

import type { SkillExecutionRecord } from '@shared/types/ruleActivity';

import type { ActiveStreamContext } from './agentChat/chatOrchestrationBridgeTypes';
import type { HookPayload } from './hooks';
import log from './logger';

type ActiveSendsMap = Map<string, ActiveStreamContext>;

let activeSendsRef: ActiveSendsMap | null = null;

/** Register the bridge's activeSends map so the tap can accumulate skill records. */
export function registerActiveSends(map: ActiveSendsMap): void {
  activeSendsRef = map;
}

function extractSkillName(taskLabel: string): string | undefined {
  if (!taskLabel.startsWith('/')) return undefined;
  const name = taskLabel.split(/\s/)[0].slice(1);
  return name.length > 0 ? name : undefined;
}

function findContextByParent(sessionId: string): ActiveStreamContext | undefined {
  if (!activeSendsRef) return undefined;
  for (const ctx of activeSendsRef.values()) {
    if (ctx.sessionId === sessionId || ctx.threadId === sessionId) return ctx;
  }
  return undefined;
}

function handleSkillStart(payload: HookPayload): void {
  const { parentSessionId, sessionId, taskLabel, model, timestamp } = payload;
  if (!parentSessionId || !taskLabel) return;

  const skillName = extractSkillName(taskLabel);
  if (!skillName) return;

  const ctx = findContextByParent(parentSessionId);
  if (!ctx) {
    log.debug('[skill-tap] agent_start with skill label but no matching context', {
      parentSessionId,
      sessionId,
      skillName,
    });
    return;
  }

  const record: SkillExecutionRecord = {
    skillName,
    agentId: sessionId,
    agentType: model ?? 'general-purpose',
    startedAt: timestamp,
    status: 'running',
  };

  ctx.skillExecutions = [...(ctx.skillExecutions ?? []), record];
  log.debug('[skill-tap] accumulated skill start', { skillName, agentId: sessionId, threadId: ctx.threadId });
}

function handleSkillEnd(payload: HookPayload): void {
  const { parentSessionId, sessionId, timestamp, error } = payload;
  if (!parentSessionId) return;

  const ctx = findContextByParent(parentSessionId);
  if (!ctx || !ctx.skillExecutions) return;

  const idx = ctx.skillExecutions.findIndex((r) => r.agentId === sessionId);
  if (idx === -1) return;

  // eslint-disable-next-line security/detect-object-injection -- idx derived from findIndex on known array
  const existing = ctx.skillExecutions[idx];
  const durationMs = timestamp - existing.startedAt;
  const updated: SkillExecutionRecord = {
    ...existing,
    completedAt: timestamp,
    durationMs: Math.max(0, durationMs),
    status: error ? 'failed' : 'completed',
    lastMessage: error,
  };

  const next = [...ctx.skillExecutions];
  // eslint-disable-next-line security/detect-object-injection -- idx derived from findIndex on known array
  next[idx] = updated;
  ctx.skillExecutions = next;
  log.debug('[skill-tap] accumulated skill end', { agentId: sessionId, status: updated.status });
}

export function tapSkillExecution(payload: HookPayload): void {
  if (payload.type === 'agent_start') {
    handleSkillStart(payload);
    return;
  }
  if (payload.type === 'agent_end') {
    handleSkillEnd(payload);
  }
}
