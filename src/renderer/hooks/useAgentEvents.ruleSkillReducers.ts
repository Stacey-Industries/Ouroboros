/**
 * useAgentEvents.ruleSkillReducers.ts — Reducer cases for rules activity and skill execution tracking.
 *
 * Extracted from helpers.ts to stay within the 300-line ESLint limit.
 */

import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';

import type { AgentState } from './useAgentEvents.helpers';
import { ensureSession, updateSession } from './useAgentEvents.session-utils';

export interface RuleLoadedAction {
  type: 'RULE_LOADED';
  sessionId: string;
  rule: LoadedRule;
}

/**
 * Wave 82 — batched rule-load action. Rule-load events from Claude Code
 * arrive in synchronous bursts (≥10 rules per session bootstrap); dispatching
 * each individually caused per-keystroke composer lag because every dispatch
 * churned AgentEventsContext value, which cascaded through useSyncStateIntoStore
 * → Lexical re-reconcile mid-keystroke. Batching collapses the cascade to one
 * dispatch per microtask.
 */
export interface RulesBatchLoadedAction {
  type: 'RULES_BATCH_LOADED';
  entries: { sessionId: string; rule: LoadedRule }[];
}

export interface SkillStartAction {
  type: 'SKILL_START';
  sessionId: string;
  record: SkillExecutionRecord;
}

export interface SkillEndAction {
  type: 'SKILL_END';
  sessionId: string;
  agentId: string;
  completedAt: number;
  durationMs: number;
  status: 'completed' | 'failed';
  lastMessage?: string;
}

export function reduceRuleLoaded(state: AgentState, action: RuleLoadedAction): AgentState {
  // Wave 82 — auto-create placeholder session if absent. Project rules from
  // Claude Code's instructions_loaded hook can arrive BEFORE session_start
  // because rules load during session bootstrap; without auto-create the
  // RULE_LOADED action would silently drop and project rules wouldn't appear
  // in the context-preview popover.
  const ensured = ensureSession(state, action.sessionId, action.rule.loadedAt);
  return updateSession(ensured, action.sessionId, (session) => ({
    ...session,
    loadedRules: [...(session.loadedRules ?? []), action.rule],
  }));
}

/**
 * Wave 82 — apply a batch of rule-loads in a single state transition.
 * Groups entries by sessionId so each session is updated exactly once.
 * Auto-creates placeholder sessions for orphan rules per reduceRuleLoaded notes.
 */
export function reduceRulesBatchLoaded(
  state: AgentState,
  action: RulesBatchLoadedAction,
): AgentState {
  const bySession = new Map<string, LoadedRule[]>();
  for (const { sessionId, rule } of action.entries) {
    const list = bySession.get(sessionId) ?? [];
    list.push(rule);
    bySession.set(sessionId, list);
  }
  let next = state;
  for (const [sessionId, rules] of bySession) {
    next = ensureSession(next, sessionId, rules[0]?.loadedAt ?? Date.now());
    next = updateSession(next, sessionId, (session) => ({
      ...session,
      loadedRules: [...(session.loadedRules ?? []), ...rules],
    }));
  }
  return next;
}

export function reduceSkillStart(state: AgentState, action: SkillStartAction): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    skillExecutions: [...(session.skillExecutions ?? []), action.record],
  }));
}

export function reduceSkillEnd(state: AgentState, action: SkillEndAction): AgentState {
  return updateSession(state, action.sessionId, (session) => {
    const executions = (session.skillExecutions ?? []).map((rec) =>
      rec.agentId === action.agentId
        ? {
            ...rec,
            completedAt: action.completedAt,
            durationMs: action.durationMs,
            status: action.status,
            lastMessage: action.lastMessage,
          }
        : rec,
    );
    return { ...session, skillExecutions: executions };
  });
}
