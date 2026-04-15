/**
 * ptyTimings.ts — Session start-time tracking for PTY exit duration measurement.
 *
 * Extracted from pty.ts to keep that file under the 300-line ESLint limit.
 * Records session spawn timestamps and fires the outcome observer on exit.
 */

import { getOutcomeObserver } from './telemetry';

const sessionStartTs = new Map<string, number>();

export function recordPtyStart(sessionId: string): void {
  sessionStartTs.set(sessionId, Date.now());
}

export function reportPtyExit(sessionId: string, cwd: string, exitCode: number): void {
  const startTs = sessionStartTs.get(sessionId);
  sessionStartTs.delete(sessionId);
  getOutcomeObserver()?.onPtyExit({
    sessionId, cwd, exitCode, signal: null,
    durationMs: startTs != null ? Date.now() - startTs : 0,
  });
}
