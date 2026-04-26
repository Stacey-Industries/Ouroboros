/**
 * useAgentEvents.ruleSkillDispatchers.ts — Dispatch helpers extracted from useAgentEvents.helpers.ts
 * and useAgentEvents.ts to stay within the 300-line ESLint limit.
 *
 * Contains: agent end, token update, rule loaded, skill start/end dispatchers.
 */

import type { Dispatch } from 'react';

import type { HookPayload, RawApiTokenUsage as TokenUsage } from '../types/electron';
import type { AgentAction } from './useAgentEvents.helpers';
import { extractSkillInfo } from './useAgentEvents.payload';

/**
 * Safety window before forcing a deferred parent's end. If a subagent crashes
 * without firing `agent_end`, the parent would otherwise stay 'running' forever.
 */
const FORCE_FINALIZE_TIMEOUT_MS = 30_000;

export function dispatchAgentEnd(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const sessionId = payload.sessionId;
  dispatch({
    type: 'AGENT_END',
    sessionId,
    timestamp: payload.timestamp,
    error: payload.error,
    costUsd: payload.costUsd,
  });
  // The reducer defers this end if live subagents exist. Schedule a forced
  // finalize so a stuck or crashed child can't pin the parent in the active
  // list forever. The forced action is a no-op when not deferred.
  setTimeout(() => {
    dispatch({ type: 'AGENT_END_FORCE_FINALIZE', sessionId });
  }, FORCE_FINALIZE_TIMEOUT_MS);
}

export function dispatchTokenUpdate(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  if (!payload.usage) return;
  dispatch({
    type: 'TOKEN_UPDATE',
    sessionId: payload.sessionId,
    usage: payload.usage as TokenUsage,
    model: payload.model,
  });
}

export function dispatchRuleLoaded(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const input = payload.input ?? {};
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return;
  const name =
    filePath
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.\w+$/, '') ?? filePath;
  const memoryType = typeof input.memory_type === 'string' ? input.memory_type : 'Project';
  const loadReason = typeof input.load_reason === 'string' ? input.load_reason : 'unknown';
  const globs = Array.isArray(input.globs)
    ? input.globs.filter((g): g is string => typeof g === 'string')
    : undefined;
  dispatch({
    type: 'RULE_LOADED',
    sessionId: payload.sessionId,
    rule: {
      filePath,
      name,
      memoryType: memoryType as 'User' | 'Project' | 'Local' | 'Managed',
      loadReason,
      globs,
      loadedAt: payload.timestamp,
    },
  });
}

export function dispatchSkillStart(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const { isSkill, skillName } = extractSkillInfo(payload);
  if (!isSkill || !skillName || !payload.parentSessionId) return;
  dispatch({
    type: 'SKILL_START',
    sessionId: payload.parentSessionId,
    record: {
      skillName,
      agentId: payload.sessionId,
      agentType: payload.model ?? 'general-purpose',
      startedAt: payload.timestamp,
      status: 'running',
    },
  });
}

export function dispatchSkillEnd(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  if (!payload.parentSessionId) return;
  dispatch({
    type: 'SKILL_END',
    sessionId: payload.parentSessionId,
    agentId: payload.sessionId,
    completedAt: payload.timestamp,
    durationMs: 0,
    status: payload.error ? 'failed' : 'completed',
    lastMessage: payload.error,
  });
}
