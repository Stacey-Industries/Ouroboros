/**
 * outcomeObserver.ts — Correlates PTY exits and conflict signals to telemetry
 * outcomes by linking them to the most recent post_tool_use event for the same
 * session within the correlation window.
 */

import log from '../logger';
import type { TelemetryStore } from './telemetryStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutcomeObserver {
  noteToolUseEvent(sessionId: string, eventId: string, timestamp: number): void;
  onPtyExit(args: PtyExitArgs): void;
  onConflictSignal(args: ConflictSignalArgs): void;
  close(): void;
}

export interface PtyExitArgs {
  sessionId: string;
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

export interface ConflictSignalArgs {
  sessionId: string;
  filePath: string;
  correlationId: string;
}

interface RecentToolUse {
  eventId: string;
  timestamp: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CORRELATION_WINDOW_MS = 30_000;
const MAX_ENTRIES = 1000;

// ─── Confidence helpers ───────────────────────────────────────────────────────

function computeConfidence(deltaMs: number): 'high' | 'medium' | 'low' {
  if (deltaMs < 5_000) return 'high';
  if (deltaMs < CORRELATION_WINDOW_MS) return 'medium';
  return 'low';
}

// ─── LRU eviction helper ──────────────────────────────────────────────────────

function evictOldestEntry(map: Map<string, RecentToolUse>): void {
  let oldestKey: string | null = null;
  let oldestTs = Infinity;
  for (const [key, val] of map) {
    if (val.timestamp < oldestTs) {
      oldestTs = val.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) map.delete(oldestKey);
}

// ─── Method implementations ───────────────────────────────────────────────────

function implNoteToolUse(
  map: Map<string, RecentToolUse>,
  sessionId: string,
  eventId: string,
  timestamp: number,
): void {
  if (map.size >= MAX_ENTRIES) evictOldestEntry(map);
  map.set(sessionId, { eventId, timestamp });
}

function implOnPtyExit(
  map: Map<string, RecentToolUse>,
  store: TelemetryStore,
  args: PtyExitArgs,
): void {
  const { sessionId, exitCode, signal, durationMs } = args;
  const recent = map.get(sessionId);
  if (!recent) return;
  const deltaMs = Date.now() - recent.timestamp;
  const confidence = computeConfidence(deltaMs);
  log.info(`[outcomeObserver] exit corr session=${sessionId} eventId=${recent.eventId} delta=${deltaMs}ms confidence=${confidence}`);
  try {
    store.recordOutcome({
      eventId: recent.eventId,
      kind: 'exit',
      exitCode: exitCode ?? null,
      durationMs,
      signals: signal != null ? [signal] : [],
      confidence,
    });
  } catch (err) {
    log.error('[outcomeObserver] recordOutcome error (exit):', err);
  }
  map.delete(sessionId);
}

function implOnConflictSignal(store: TelemetryStore, args: ConflictSignalArgs): void {
  const { filePath, correlationId } = args;
  log.info(`[outcomeObserver] conflict corr correlationId=${correlationId} file=${filePath}`);
  try {
    store.recordOutcome({ eventId: correlationId, kind: 'conflict', signals: [filePath], confidence: 'high' });
  } catch (err) {
    log.error('[outcomeObserver] recordOutcome error (conflict):', err);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createOutcomeObserver(store: TelemetryStore): OutcomeObserver {
  const lastToolUse = new Map<string, RecentToolUse>();
  return {
    noteToolUseEvent: (sid, eid, ts) => implNoteToolUse(lastToolUse, sid, eid, ts),
    onPtyExit: (args) => implOnPtyExit(lastToolUse, store, args),
    onConflictSignal: (args) => implOnConflictSignal(store, args),
    close: () => lastToolUse.clear(),
  };
}

// ─── Singleton API ────────────────────────────────────────────────────────────

let singleton: OutcomeObserver | null = null;

export function initOutcomeObserver(store: TelemetryStore): void {
  if (singleton) return;
  singleton = createOutcomeObserver(store);
  log.info('[outcomeObserver] initialised');
}

export function getOutcomeObserver(): OutcomeObserver | null {
  return singleton;
}

export function closeOutcomeObserver(): void {
  if (!singleton) return;
  singleton.close();
  singleton = null;
  log.info('[outcomeObserver] closed');
}

/** @internal Test-only reset — clears singleton state between test cases. */
export function _resetForTests(): void {
  singleton = null;
}
