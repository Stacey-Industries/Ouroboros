/**
 * coachLogger.ts — JSONL logger for delegation coach nudge events.
 *
 * Appends one JSON line per nudge event to `{logDir}/delegation-coach.jsonl`.
 * Rotates when the log file exceeds 10 MB — the current file is renamed to
 * `delegation-coach.{ISO-date}.jsonl` and a fresh file is started.
 *
 * Usage:
 *   const logger = createCoachLogger(app.getPath('userData'));
 *   logger.log(entry);
 *   logger.close();
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_FILENAME = 'delegation-coach.jsonl';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Entry types ────────────────────────────────────────────────────────────

export type CoachEscalation = 'soft' | 'acknowledgment' | 'hard';
export type CoachOutcome = 'pending' | 'taken' | 'ignored' | 'bypassed';

export interface CoachLogEntry {
  /** ISO 8601 timestamp of the nudge event. */
  timestamp: string;
  /** Stable Claude Code session id from the hook payload. */
  sessionId: string;
  /** Per-nudge unique id; lets later events (outcome) join back to this one. */
  nudgeId: string;
  /** Pattern that fired. References patterns.ts SEED_PATTERNS[].id. */
  patternId: string;
  /** Escalation tier at fire time. */
  escalation: CoachEscalation;
  /** Tool call that triggered the nudge. */
  toolCall: { tool: string; input: Record<string, unknown> };
  /**
   * Outcome — written by Phase D when known. Initial events should set 'pending'.
   * Phase D will append a separate event of kind 'outcome-update' rather than
   * rewriting the original line; this field captures the BEST KNOWN outcome at
   * the time the entry was written. Phase B writes 'pending'.
   */
  outcome: CoachOutcome;
  /** Free-form metadata; kept open for analytics. */
  meta?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDateStamp(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function rotatePath(logPath: string): string {
  const ext = path.extname(logPath);
  const base = path.basename(logPath, ext);
  const dir = path.dirname(logPath);
  return path.join(dir, `${base}.${isoDateStamp()}${ext}`);
}

// ─── State ───────────────────────────────────────────────────────────────────

interface LoggerState {
  logPath: string;
  fd: number | null;
}

// ─── Internal write helpers ──────────────────────────────────────────────────

function openFd(logPath: string): number {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- logPath is derived from app.getPath('userData'), a trusted internal path
  return fs.openSync(logPath, 'a');
}

function rotateIfNeeded(state: LoggerState): void {
  let size = 0;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path; see above
    size = fs.statSync(state.logPath).size;
  } catch {
    return; // file doesn't exist yet — nothing to rotate
  }
  if (size <= MAX_BYTES) return;

  if (state.fd !== null) {
    fs.closeSync(state.fd);
    state.fd = null;
  }

  const rotated = rotatePath(state.logPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path; see above
  fs.renameSync(state.logPath, rotated);
  state.fd = openFd(state.logPath);
}

function writeLine(state: LoggerState, entry: CoachLogEntry): void {
  rotateIfNeeded(state);

  if (state.fd === null) {
    state.fd = openFd(state.logPath);
  }

  const line = JSON.stringify(entry) + '\n';
  fs.writeSync(state.fd, line, undefined, 'utf8');
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface CoachLogger {
  log(entry: CoachLogEntry): void;
  close(): void;
}

export function createCoachLogger(logDir: string): CoachLogger {
  const state: LoggerState = {
    logPath: path.join(logDir, LOG_FILENAME),
    fd: null,
  };

  return {
    log(entry: CoachLogEntry): void {
      writeLine(state, entry);
    },

    close(): void {
      if (state.fd !== null) {
        fs.closeSync(state.fd);
        state.fd = null;
      }
    },
  };
}
