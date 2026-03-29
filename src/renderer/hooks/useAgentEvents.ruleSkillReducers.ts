/**
 * useAgentEvents.ruleSkillReducers.ts — Reducer cases for rules activity and skill execution tracking.
 *
 * Extracted from helpers.ts to stay within the 300-line ESLint limit.
 */

import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';

import type { AgentState } from './useAgentEvents.helpers';
import { updateSession } from './useAgentEvents.session-utils';

export interface RuleLoadedAction {
  type: 'RULE_LOADED';
  sessionId: string;
  rule: LoadedRule;
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
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    loadedRules: [...(session.loadedRules ?? []), action.rule],
  }));
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
        ? { ...rec, completedAt: action.completedAt, durationMs: action.durationMs, status: action.status, lastMessage: action.lastMessage }
        : rec,
    );
    return { ...session, skillExecutions: executions };
  });
}
