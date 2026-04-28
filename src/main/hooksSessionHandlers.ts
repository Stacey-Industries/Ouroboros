/**
 * hooksSessionHandlers.ts — Session lifecycle event handlers extracted from hooks.ts.
 *
 * Handles: session_start, session_end, session_stop, CLAUDE.md auto-generation,
 * and PreToolUse enforcement (Wave 50 Phase B).
 * Functions take `sessionCwdMap` as a parameter so they remain pure with respect
 * to that shared module-scope state owned by hooks.ts.
 */

import { generateClaudeMd } from './claudeMdGenerator';
import { getGraphController } from './codebaseGraph/graphControllerSupport';
import { getConfigValue } from './config';
import { getContextLayerController } from './contextLayer/contextLayerController';
import { dispatchActivationEvent } from './extensions';
import type { HookPayload } from './hooks';
import { evaluatePreToolUse as blockLockfiles } from './hooks/blockLockfileEdits';
import { evaluatePreToolUse as blockMinified } from './hooks/blockMinifiedOperations';
import { evaluatePreToolUse as blockSecrets } from './hooks/blockSecretWrites';
import { evaluateStop } from './hooks/gotchaUpdateNudge';
import type { HookDecision } from './hooks/hookDecision';
import { evaluatePreToolUse as warnTestSuite } from './hooks/warnFullTestSuite';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './ipc-handlers/agentChat';
import log from './logger';
import { flushSession } from './orchestration/contextRankerTelemetry';
import { trackSessionEnd } from './router/qualitySignalCollector';

// ─── PreToolUse enforcement (Wave 50 Phase B) ────────────────────────────────

type Evaluator = (payload: HookPayload) => HookDecision;

const EVALUATORS: Evaluator[] = [blockSecrets, blockLockfiles, blockMinified, warnTestSuite];

/**
 * Runs all PreToolUse enforcement handlers in sequence.
 * The first non-pass decision (deny > warn) wins.
 * Never throws — a handler failure returns pass so sessions are not disrupted.
 */
export function runPreToolEnforcement(payload: HookPayload): HookDecision {
  for (const evaluate of EVALUATORS) {
    let decision: HookDecision;
    try {
      decision = evaluate(payload);
    } catch (err) {
      log.warn('[hook-enforce] handler error (passing through):', err);
      continue;
    }
    if (decision.kind === 'deny') return decision;
    if (decision.kind === 'warn') {
      log.info('[hook-enforce] warn', { rule: decision.ruleName, message: decision.message });
      return decision;
    }
  }
  return { kind: 'pass' };
}

// ─── CLAUDE.md auto-generation ───────────────────────────────────────────────

export function triggerClaudeMdGeneration(
  trigger: 'post-session' | 'post-commit',
  payload: HookPayload,
  sessionCwdMap: Map<string, string>,
): void {
  try {
    const settings = getConfigValue('claudeMdSettings');
    if (!settings?.enabled || settings.triggerMode !== trigger) return;

    const projectRoot = payload.cwd ?? sessionCwdMap.get(payload.sessionId) ?? null;
    sessionCwdMap.delete(payload.sessionId);

    if (!projectRoot) {
      log.info(
        `Skipping auto-generation — cannot determine project root for session ${payload.sessionId}`,
      );
      return;
    }

    log.info(`Auto-generating for ${projectRoot} (session ${payload.sessionId})`);
    generateClaudeMd(projectRoot).catch((err: unknown) => {
      log.error('Auto-generation failed:', err);
    });
  } catch {
    // Config not available yet — ignore
  }
}

// ─── Session lifecycle handlers ───────────────────────────────────────────────

export function handleSessionStart(payload: HookPayload): void {
  dispatchActivationEvent('onSessionStart', { sessionId: payload.sessionId }).catch(() => {});
  if (!payload.internal) {
    getContextLayerController()?.onSessionStart();
    getGraphController()?.onSessionStart();
  }
}

export function handleSessionEnd(payload: HookPayload): void {
  dispatchActivationEvent('onSessionEnd', { sessionId: payload.sessionId }).catch(() => {});
  // Wave 53b Phase B — flush ranker hit-rate summary for this session.
  flushSession(payload.sessionId);
}

export function handleSessionStop(payload: HookPayload, sessionCwdMap: Map<string, string>): void {
  if (!payload.internal) {
    getContextLayerController()?.onGitCommit();
    getGraphController()?.onGitCommit();
    invalidateAgentChatCache();
    triggerClaudeMdGeneration('post-session', payload, sessionCwdMap);
    trackSessionEnd({
      type: payload.type,
      sessionId: payload.sessionId,
      cwd: payload.cwd ?? sessionCwdMap.get(payload.sessionId),
    });
    try {
      evaluateStop(payload);
    } catch (err) {
      log.warn('[claude-md:nudge] evaluateStop failed:', err);
    }
  }
}
