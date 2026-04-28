/**
 * contextRankerTelemetry.ts — Wave 53b Phase B
 *
 * Online ranker hit-rate telemetry. Observes what the ranker pre-loaded into
 * <relevant_code> and correlates against subsequent Read tool calls within the
 * same session. Writes per-session JSONL records to:
 *   ~/.ouroboros/telemetry/ranker-hits.jsonl
 *
 * Two record types:
 *   RankerSelectionRecord — emitted immediately after rerankRankedFiles returns.
 *   RankerHitRecord       — emitted at session-end with correlation summary.
 *
 * Telemetry respects contextRanker.telemetryEnabled (default true).
 * When disabled, all exported functions are no-ops.
 *
 * Privacy:
 *   - Paths stored relative to workspaceRoot only. Never absolute.
 *   - No file contents are stored.
 */

import fs from 'fs';
import path from 'path';

import { getConfigValue } from '../config';
import log from '../logger';
import {
  RANKER_HIT_SCHEMA_VERSION,
  RANKER_SELECTION_SCHEMA_VERSION,
  type RankerHitRecord,
  type RankerSelectionRecord,
} from './rankerHitsSchema';
import type { RankedContextFile } from './types';

// ---------------------------------------------------------------------------
// Internal per-session state
// ---------------------------------------------------------------------------

interface SessionState {
  /** Ordered list of pre-loaded absolute paths (order = rank). */
  rankedPaths: string[];
  /** Set of absolute paths for O(1) hit lookup. */
  preLoadedSet: Set<string>;
  /** Distinct absolute paths that were Read during the session. */
  readHits: Set<string>;
  /** Total Read tool calls (including non-hits). */
  totalReads: number;
  /** Timestamp of the selection event (for duration calculation). */
  selectionTs: number;
}

/** Keyed by sessionId. Cleaned up in flushSession. */
const sessionStates = new Map<string, SessionState>();

// ---------------------------------------------------------------------------
// Config gate
// ---------------------------------------------------------------------------

function isTelemetryEnabled(): boolean {
  try {
    const cfg = getConfigValue('contextRanker') as { telemetryEnabled?: boolean } | undefined;
    return cfg?.telemetryEnabled !== false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function telemetryDir(): string {
  return path.join(process.env.USERPROFILE || process.env.HOME || '.', '.ouroboros', 'telemetry');
}

function ensureDir(dir: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry dir under USERPROFILE
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    log.warn('[ranker-telemetry] mkdir failed:', err);
    return false;
  }
}

function appendRecord(record: Record<string, unknown>): void {
  const dir = telemetryDir();
  if (!ensureDir(dir)) return;
  const filePath = path.join(dir, 'ranker-hits.jsonl');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path under USERPROFILE
    fs.appendFile(filePath, JSON.stringify(record) + '\n', (err) => {
      if (err) log.warn('[ranker-telemetry] append failed:', err);
    });
  } catch (err) {
    log.warn('[ranker-telemetry] write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function toRelative(absPath: string, workspaceRoot: string): string {
  try {
    return path.relative(workspaceRoot, absPath);
  } catch {
    return absPath;
  }
}

function toAbsolute(relPath: string, workspaceRoot: string): string {
  try {
    return path.isAbsolute(relPath) ? relPath : path.join(workspaceRoot, relPath);
  } catch {
    return relPath;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecordRankerSelectionInput {
  sessionId: string;
  workspaceRoot: string;
  files: RankedContextFile[];
  totalFiles: number;
}

/**
 * Called from contextPacketBuilder after rerankRankedFiles returns.
 * Stores pre-loaded file set in memory and writes a RankerSelectionRecord.
 * Tolerates all errors — never throws.
 */
export function recordRankerSelection(input: RecordRankerSelectionInput): void {
  if (!isTelemetryEnabled()) return;
  try {
    writeSelectionRecord(input);
  } catch (err) {
    log.warn('[ranker-telemetry] recordRankerSelection error:', err);
  }
}

function buildSelectionFiles(
  files: RankedContextFile[],
  workspaceRoot: string,
): RankerSelectionRecord['files'] {
  return files.map((f) => ({
    path: toRelative(f.filePath, workspaceRoot),
    score: f.score,
    confidence: f.confidence,
    reasons: f.reasons.map((r) => r.kind),
  }));
}

function writeSelectionRecord(input: RecordRankerSelectionInput): void {
  const { sessionId, workspaceRoot, files, totalFiles } = input;
  const ts = Date.now();

  const rankedPaths = files.map((f) => f.filePath);
  const preLoadedSet = new Set(rankedPaths);
  sessionStates.set(sessionId, {
    rankedPaths,
    preLoadedSet,
    readHits: new Set(),
    totalReads: 0,
    selectionTs: ts,
  });

  const record: RankerSelectionRecord & { schemaVersion: number } = {
    schemaVersion: RANKER_SELECTION_SCHEMA_VERSION,
    sessionId,
    workspaceRoot,
    ts,
    files: buildSelectionFiles(files, workspaceRoot),
    totalFiles,
  };
  appendRecord(record as unknown as Record<string, unknown>);
  log.info('[ranker-telemetry] selection recorded', { sessionId, fileCount: files.length });
}

/**
 * Called from the Read pre_tool_use hook handler for each Read tool call.
 * Increments hit counter if the path was pre-loaded for this session.
 * No-op when telemetry is disabled or session is unknown.
 * Tolerates all errors — never throws.
 */
export function noteReadDuringSession(
  sessionId: string,
  filePath: string,
  workspaceRoot: string,
): void {
  if (!isTelemetryEnabled()) return;
  try {
    const state = sessionStates.get(sessionId);
    if (!state) return;
    state.totalReads += 1;
    const absPath = toAbsolute(filePath, workspaceRoot);
    if (state.preLoadedSet.has(absPath)) {
      state.readHits.add(absPath);
    }
  } catch (err) {
    log.warn('[ranker-telemetry] noteReadDuringSession error:', err);
  }
}

/**
 * Called on session-end. Writes a RankerHitRecord summarising correlation,
 * then cleans up in-memory state for this session.
 * No-op when telemetry is disabled or session has no recorded selection.
 * Tolerates all errors — never throws.
 */
export function flushSession(sessionId: string): void {
  if (!isTelemetryEnabled()) return;
  try {
    writeHitRecord(sessionId);
  } catch (err) {
    log.warn('[ranker-telemetry] flushSession error:', err);
  } finally {
    sessionStates.delete(sessionId);
  }
}

function buildHitsByRank(state: SessionState): number[] {
  return state.rankedPaths.map((p) => (state.readHits.has(p) ? 1 : 0));
}

function writeHitRecord(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state) return;

  const ts = Date.now();
  const record: RankerHitRecord & { schemaVersion: number } = {
    schemaVersion: RANKER_HIT_SCHEMA_VERSION,
    sessionId,
    ts,
    preLoadedCount: state.rankedPaths.length,
    uniqueReadHits: state.readHits.size,
    totalReads: state.totalReads,
    hitsByRank: buildHitsByRank(state),
    sessionDurationMs: ts - state.selectionTs,
  };
  appendRecord(record as unknown as Record<string, unknown>);
  log.info('[ranker-telemetry] hit record flushed', {
    sessionId,
    preLoadedCount: record.preLoadedCount,
    uniqueReadHits: record.uniqueReadHits,
    totalReads: record.totalReads,
  });
}

/**
 * Exposed for testing: returns the current in-memory session count.
 * Not part of the public telemetry API.
 */
export function getActiveSessionCount(): number {
  return sessionStates.size;
}
