/**
 * qualitySignalCollector.ts — Stateful collector for implicit routing quality signals.
 *
 * Tracks chat turns (regeneration, correction), session outcomes (natural stop,
 * abort), and post-session git activity (code committed). Writes annotations
 * to `{userData}/router-quality-signals.jsonl` joined by traceId/sessionId.
 *
 * Module-level state is bounded: max 10K entries, 10-minute eviction on flush.
 */

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import log from '../logger';
import {
  buildAnnotation,
  computeJaccardOverlap,
  isCorrectionPrefix,
  isValidCwd,
} from './qualitySignalCollectorHelpers';
import type { QualityAnnotation } from './qualitySignalTypes';

/* ── Constants ───────────────────────────────────────────────────────── */

const SIGNALS_FILENAME = 'router-quality-signals.jsonl';
const REGENERATION_THRESHOLD = 0.7;
const MAX_PENDING = 10_000;
const EVICTION_AGE_MS = 10 * 60 * 1000; // 10 minutes
const GIT_CHECK_DELAY_MS = 2 * 60 * 1000; // 2 minutes
const GIT_CHECK_FINAL_MS = 5 * 60 * 1000; // 5 minutes
const GIT_EXEC_TIMEOUT_MS = 5_000;

/* ── Module state ────────────────────────────────────────────────────── */

interface ChatTurnRecord {
  traceId: string;
  promptWords: string;
  timestamp: number;
}

const chatHistory = new Map<string, ChatTurnRecord>();
const completedSessions = new Set<string>();
const pendingAnnotations: QualityAnnotation[] = [];
const gitCheckTimers = new Set<ReturnType<typeof setTimeout>>();

/* ── Chat turn tracking ──────────────────────────────────────────────── */

export interface ChatTurnArgs {
  traceId: string;
  threadId?: string;
  prompt: string;
}

/** Detect regeneration and correction patterns from chat turns. */
export function trackChatTurn(args: ChatTurnArgs): void {
  const { traceId, threadId, prompt } = args;
  if (!threadId) return;

  const prev = chatHistory.get(threadId);
  if (prev) {
    detectRegeneration(prev, prompt);
    detectCorrection(prev, prompt);
  }

  chatHistory.set(threadId, {
    traceId,
    promptWords: prompt,
    timestamp: Date.now(),
  });
  evictStaleEntries();
}

function detectRegeneration(prev: ChatTurnRecord, prompt: string): void {
  const overlap = computeJaccardOverlap(prev.promptWords, prompt);
  if (overlap < REGENERATION_THRESHOLD) return;
  pushAnnotation(
    buildAnnotation({
      kind: 'chat_regenerate',
      traceId: prev.traceId,
      value: 0,
      meta: { jaccardOverlap: Math.round(overlap * 100) / 100 },
    }),
  );
}

function detectCorrection(prev: ChatTurnRecord, prompt: string): void {
  if (!isCorrectionPrefix(prompt)) return;
  pushAnnotation(
    buildAnnotation({
      kind: 'chat_correction',
      traceId: prev.traceId,
      value: 0,
    }),
  );
}

/* ── Session end tracking ────────────────────────────────────────────── */

interface SessionEndEvent {
  type: string;
  sessionId: string;
  cwd?: string;
}

/** Track session end signals and schedule git commit checks. */
export function trackSessionEnd(event: SessionEndEvent): void {
  const isNatural = event.type === 'session_stop' || event.type === 'agent_end';
  const kind = isNatural ? 'terminal_natural_stop' : 'terminal_user_abort';

  pushAnnotation(
    buildAnnotation({
      kind,
      sessionId: event.sessionId,
      value: isNatural ? 1 : 0,
    }),
  );

  if (isValidCwd(event.cwd)) {
    scheduleGitCheck(event.sessionId, event.cwd, GIT_CHECK_DELAY_MS);
    scheduleGitCheck(event.sessionId, event.cwd, GIT_CHECK_FINAL_MS);
  }
}

/** Track task_completed hook events. */
export function trackTaskCompleted(sessionId: string): void {
  completedSessions.add(sessionId);
  pushAnnotation(
    buildAnnotation({
      kind: 'task_completed',
      sessionId,
      value: 1,
    }),
  );
}

/* ── Git commit checking ─────────────────────────────────────────────── */

function scheduleGitCheck(sessionId: string, cwd: string, delayMs: number): void {
  const timer = setTimeout(() => {
    gitCheckTimers.delete(timer);
    checkRecentCommit(sessionId, cwd);
  }, delayMs);
  gitCheckTimers.add(timer);
}

function checkRecentCommit(sessionId: string, cwd: string): void {
  const minutes = Math.ceil(GIT_CHECK_FINAL_MS / 60_000) + 1;
  const cmd = `git log -1 --format=%H --since="${minutes} minutes ago"`;

  // eslint-disable-next-line security/detect-child-process -- cwd validated by isValidCwd; cmd is a static string
  exec(cmd, { cwd, timeout: GIT_EXEC_TIMEOUT_MS }, (err, stdout) => {
    if (err) return; // git not installed or not a repo — silently skip
    const hash = stdout.trim();
    if (hash.length > 0) {
      pushAnnotation(
        buildAnnotation({
          kind: 'code_committed',
          sessionId,
          value: 1,
          meta: { commitHash: hash.slice(0, 8) },
        }),
      );
      flushAnnotations();
    }
  });
}

/* ── Annotation buffering + JSONL persistence ────────────────────────── */

function pushAnnotation(annotation: QualityAnnotation): void {
  if (pendingAnnotations.length >= MAX_PENDING) {
    pendingAnnotations.shift(); // drop oldest
    log.warn('[quality-signals] annotation buffer overflow — dropping oldest');
  }
  pendingAnnotations.push(annotation);
}

/** Write buffered annotations to disk and clear the buffer. Fire-and-forget async write to avoid blocking the IPC hot path. */
export function flushAnnotations(): void {
  if (pendingAnnotations.length === 0) return;
  const filePath = path.join(app.getPath('userData'), SIGNALS_FILENAME);
  const lines = pendingAnnotations.map((a) => JSON.stringify(a)).join('\n') + '\n';
  pendingAnnotations.length = 0;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from app.getPath('userData'), trusted
  fs.promises.appendFile(filePath, lines, 'utf8').catch((err: unknown) => {
    log.warn('[quality-signals] flush failed:', err);
  });
}

/* ── Eviction + cleanup ──────────────────────────────────────────────── */

function evictStaleEntries(): void {
  const cutoff = Date.now() - EVICTION_AGE_MS;
  for (const [threadId, record] of chatHistory) {
    if (record.timestamp < cutoff) chatHistory.delete(threadId);
  }
}

/** Clear all pending timers — call from app.before-quit. */
export function clearQualityTimers(): void {
  for (const timer of gitCheckTimers) clearTimeout(timer);
  gitCheckTimers.clear();
  flushAnnotations();
}

/* ── Test helpers (not exported from barrel) ──────────────────────────── */

export function _getPendingCount(): number {
  return pendingAnnotations.length;
}
export function _resetState(): void {
  pendingAnnotations.length = 0;
  chatHistory.clear();
  completedSessions.clear();
  for (const timer of gitCheckTimers) clearTimeout(timer);
  gitCheckTimers.clear();
}
