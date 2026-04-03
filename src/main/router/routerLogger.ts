/**
 * routerLogger.ts — JSONL logger for routing decisions.
 *
 * Appends one JSON line per routing decision to `{logDir}/router-decisions.jsonl`.
 * Rotates when the log file exceeds 10 MB — the current file is renamed to
 * `router-decisions.{ISO-date}.jsonl` and a fresh file is started.
 *
 * Usage:
 *   const logger = createRouterLogger(app.getPath('userData'));
 *   logger.log(entry);
 *   logger.logOverride('SONNET', 'claude-opus-4-6', 'please review…');
 *   logger.close();
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ModelTier, RoutingLogEntry } from './routerTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_FILENAME = 'router-decisions.jsonl';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const HASH_HEX_CHARS = 16;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePromptHash(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, HASH_HEX_CHARS);
}

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

function rotatIfNeeded(state: LoggerState): void {
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

function writeLine(state: LoggerState, entry: RoutingLogEntry): void {
  rotatIfNeeded(state);

  if (state.fd === null) {
    state.fd = openFd(state.logPath);
  }

  const line = JSON.stringify(entry) + '\n';
  fs.writeSync(state.fd, line, undefined, 'utf8');
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface RouterLogger {
  log(entry: RoutingLogEntry): void;
  logOverride(routerTier: ModelTier, userChosenModel: string, promptPreview: string): void;
  close(): void;
}

export function createRouterLogger(logDir: string): RouterLogger {
  const state: LoggerState = {
    logPath: path.join(logDir, LOG_FILENAME),
    fd: null,
  };

  return {
    log(entry: RoutingLogEntry): void {
      writeLine(state, entry);
    },

    logOverride(routerTier: ModelTier, userChosenModel: string, promptPreview: string): void {
      const entry: RoutingLogEntry = {
        timestamp: new Date().toISOString(),
        promptPreview,
        promptHash: computePromptHash(promptPreview),
        tier: routerTier,
        model: userChosenModel,
        routedBy: 'default',
        confidence: 1,
        latencyMs: 0,
        layer1Result: null,
        layer2Result: null,
        layer3Result: null,
        override: { userChosenModel, routerSuggestedTier: routerTier },
      };
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

// ─── Standalone hash export (used by tests + feature extractor) ──────────────

export { computePromptHash };
