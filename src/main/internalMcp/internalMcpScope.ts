/**
 * internalMcpScope.ts — Decides whether a spawn should expose Ouroboros graph tools.
 *
 * Wave 48 Phase B: replaces the always-on injection model with a per-spawn
 * decision based on goal classification + an `internalMcpScope` config flag.
 *
 * Modes:
 *   'always'     — pre-Wave-48 behaviour: inject for every spawn.
 *   'task-gated' — inject only when the goal looks code-shaped (default).
 *   'never'      — global kill, equivalent to internalMcpEnabled:false.
 *
 * `internalMcpEnabled: false` short-circuits to `false` regardless of scope.
 */

import { getConfigValue } from '../config';
import type { GoalShape } from '../orchestration/providers/goalClassifier';

export type InternalMcpScope = 'always' | 'task-gated' | 'never';

export interface ScopeDecisionInputs {
  goalShape: GoalShape;
  /** Explicit per-request override; bypasses scope when set. */
  forceInclude?: boolean;
  forceExclude?: boolean;
}

export interface ScopeDecision {
  shouldInjectOuroboros: boolean;
  reason: string;
}

function readEnabled(): boolean {
  const v = getConfigValue('internalMcpEnabled');
  return v !== false;
}

function readScope(): InternalMcpScope {
  const raw = getConfigValue('internalMcpScope');
  if (raw === 'always' || raw === 'task-gated' || raw === 'never') return raw;
  return 'task-gated';
}

function decideForScope(scope: InternalMcpScope, goalShape: GoalShape): ScopeDecision {
  if (scope === 'always') {
    return { shouldInjectOuroboros: true, reason: 'scope=always' };
  }
  if (scope === 'never') {
    return { shouldInjectOuroboros: false, reason: 'scope=never' };
  }
  // task-gated: code → inject; casual → skip; unknown → inject (safe default).
  if (goalShape === 'casual') {
    return { shouldInjectOuroboros: false, reason: 'task-gated:casual-goal' };
  }
  return { shouldInjectOuroboros: true, reason: `task-gated:${goalShape}-goal` };
}

export function resolveInternalMcpScope(inputs: ScopeDecisionInputs): ScopeDecision {
  if (!readEnabled()) {
    return { shouldInjectOuroboros: false, reason: 'internalMcpEnabled=false' };
  }
  if (inputs.forceExclude) {
    return { shouldInjectOuroboros: false, reason: 'request-override:exclude' };
  }
  if (inputs.forceInclude) {
    return { shouldInjectOuroboros: true, reason: 'request-override:include' };
  }
  const scope = readScope();
  return decideForScope(scope, inputs.goalShape);
}
