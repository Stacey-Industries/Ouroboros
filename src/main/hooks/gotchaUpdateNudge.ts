/**
 * gotchaUpdateNudge.ts — Wave 49 Phase C
 *
 * Evaluates a Stop hook event and emits a structured log nudge when the
 * session looks like a bug fix. Passive — never blocks or modifies the event.
 *
 * Bug-fix signal requires BOTH:
 *   1. Session modified existing files (not only additions).
 *   2. Commit message contains a bug-fix keyword (case-insensitive, word-boundary).
 */

import type { HookPayload } from '../hooks';
import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NudgeResult {
  triggered: boolean;
  reason?: string;
}

export interface StopEventData {
  /** Git diff summary lines from the session (e.g. from data.diff). */
  diff?: string;
  /** Commit message from the session (e.g. from data.commitMessage). */
  commitMessage?: string;
}

// ─── Classification helpers ───────────────────────────────────────────────────

const BUG_KEYWORDS = /\b(fix|bug|issue|gotcha|regression|defect|broken)\b/i;

// Lines starting with M (modified), D (deleted), or R (renamed) in diff --stat
// output indicate existing-file changes. Lines starting with A are additions.
const EXISTING_FILE_DIFF_LINE = /^[MDR]\t/m;

/** Returns true if the diff string contains modifications to existing files. */
export function hasExistingFileChanges(diff: string | undefined): boolean {
  if (!diff) return false;
  return EXISTING_FILE_DIFF_LINE.test(diff);
}

/** Returns true if the commit message contains a bug-fix keyword. */
export function hasBugFixKeyword(commitMessage: string | undefined): boolean {
  if (!commitMessage) return false;
  return BUG_KEYWORDS.test(commitMessage);
}

// ─── Telemetry emit ───────────────────────────────────────────────────────────

function emitNudge(sessionId: string, reason: string): void {
  log.info('[claude-md:nudge]', {
    sessionId,
    reason,
    hint: 'Consider appending a line to the nearest subsystem CLAUDE.md ## Gotchas section.',
    format: '- **<topic>**: <rule>. Reason: <why>.',
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a Stop hook event and emits a nudge if the session looks like
 * a bug fix. Returns a result object for testability.
 *
 * Never throws. Wrap callers in try/catch for extra safety.
 */
export function evaluateStop(payload: HookPayload): NudgeResult {
  const data = (payload.data ?? {}) as StopEventData;
  const diff = typeof data.diff === 'string' ? data.diff : undefined;
  const commitMessage = typeof data.commitMessage === 'string' ? data.commitMessage : undefined;

  if (!hasExistingFileChanges(diff)) {
    return { triggered: false, reason: 'no existing-file changes in diff' };
  }

  if (!hasBugFixKeyword(commitMessage)) {
    return { triggered: false, reason: 'no bug-fix keyword in commit message' };
  }

  const reason = `bug-fix keyword in commit message + existing-file changes detected`;
  emitNudge(payload.sessionId, reason);
  return { triggered: true, reason };
}
