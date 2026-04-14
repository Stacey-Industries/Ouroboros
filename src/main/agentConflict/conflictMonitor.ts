/**
 * agentConflict/conflictMonitor.ts — Singleton conflict detector.
 *
 * Subscribes to PostToolUse hook events for Edit/Write tool calls
 * (tapped in hooks.ts). Maintains per-(root,session) file sets.
 * On 200ms debounced update, queries the codebase graph for symbol
 * overlap and emits AgentConflictSnapshot via EventEmitter.
 *
 * Multi-root safe: conflicts are scoped strictly within a projectRoot.
 */

import type { AgentConflictReport, AgentConflictSnapshot } from '@shared/types/agentConflict';
import { EventEmitter } from 'events';

import type { GraphNode } from '../codebaseGraph/graphTypes';
import log from '../logger';
import type { DismissEntry, RootSessionMap } from './conflictMonitorSupport';
import {
  buildOverlapSymbols,
  computeSymbols,
  extractSessionId,
  getOrCreateEntry,
  getSessionsForRoot,
  isGraphHot,
  pairKey,
  rootSessionKey,
  severityForSymbols,
  shouldClearDismiss,
} from './conflictMonitorSupport';

export interface ConflictMonitor extends EventEmitter {
  recordEdit(projectRoot: string, sessionId: string, filePath: string): void;
  dismiss(sessionA: string, sessionB: string): void;
  getSnapshot(projectRoot?: string): AgentConflictSnapshot;
  dispose(): void;
}

// ── State container ───────────────────────────────────────────────────────────

interface MonitorState {
  sessions: RootSessionMap;
  dismissedPairs: Map<string, DismissEntry>;
  debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
  cachedSnapshot: AgentConflictSnapshot;
}

function makeState(): MonitorState {
  return {
    sessions: new Map(),
    dismissedPairs: new Map(),
    debounceTimers: new Map(),
    cachedSnapshot: { reports: [], sessionFiles: {} },
  };
}

// ── Pair report builder ───────────────────────────────────────────────────────

interface PairReportArgs {
  sidA: string; entryA: { files: Set<string> };
  sidB: string; entryB: { files: Set<string> };
  symsA: GraphNode[];
  symsB: GraphNode[];
  hot: boolean;
}

function buildPairReport(args: PairReportArgs): AgentConflictReport {
  const { sidA, entryA, sidB, entryB, symsA, symsB, hot } = args;
  const overlappingFiles = Array.from(entryA.files).filter((f) => entryB.files.has(f));
  const overlappingSymbols = hot ? buildOverlapSymbols(symsA, symsB) : [];
  const severity = hot ? severityForSymbols(symsA, symsB) : 'warning';
  return { sessionA: sidA, sessionB: sidB, overlappingSymbols, overlappingFiles,
    severity, updatedAt: Date.now(), fileOnly: !hot };
}

// ── Dismiss check ─────────────────────────────────────────────────────────────

function checkAndClearDismiss(
  state: MonitorState,
  pair: string,
  filesA: Set<string>,
  filesB: Set<string>,
): boolean {
  const dismissed = state.dismissedPairs.get(pair);
  if (!dismissed) return false;
  if (!shouldClearDismiss(dismissed, filesA, filesB)) return true; // still dismissed
  state.dismissedPairs.delete(pair);
  return false;
}

// ── Per-pair conflict computation ─────────────────────────────────────────────

async function computePairReports(
  state: MonitorState,
  root: string,
  rootSessions: Array<{ sessionId: string; entry: { files: Set<string> } }>,
  hot: boolean,
): Promise<AgentConflictReport[]> {
  const symbolCache = new Map<string, Awaited<ReturnType<typeof computeSymbols>>>();
  if (hot) {
    await Promise.all(rootSessions.map(async ({ sessionId, entry }) => {
      symbolCache.set(sessionId, await computeSymbols(root, sessionId, Array.from(entry.files)));
    }));
  }
  const reports: AgentConflictReport[] = [];
  for (let i = 0; i < rootSessions.length; i++) {
    for (let j = i + 1; j < rootSessions.length; j++) {
      // eslint-disable-next-line security/detect-object-injection -- numeric loop indices
      const { sessionId: sidA, entry: entryA } = rootSessions[i];
      // eslint-disable-next-line security/detect-object-injection -- numeric loop indices
      const { sessionId: sidB, entry: entryB } = rootSessions[j];
      const overlaps = Array.from(entryA.files).filter((f) => entryB.files.has(f));
      if (overlaps.length === 0) continue;
      if (checkAndClearDismiss(state, pairKey(sidA, sidB), entryA.files, entryB.files)) continue;
      const symsA = symbolCache.get(sidA) ?? [];
      const symsB = symbolCache.get(sidB) ?? [];
      reports.push(buildPairReport({ sidA, entryA, sidB, entryB, symsA, symsB, hot }));
    }
  }
  return reports;
}

// ── Root recompute ────────────────────────────────────────────────────────────

async function computeReportsForRoot(
  state: MonitorState,
  root: string,
): Promise<AgentConflictReport[]> {
  const rootSessions = getSessionsForRoot(state.sessions, root);
  if (rootSessions.length < 2) return [];
  return computePairReports(state, root, rootSessions, isGraphHot(root));
}

async function recompute(
  state: MonitorState,
  emitter: EventEmitter,
  root: string,
): Promise<void> {
  try {
    const reports = await computeReportsForRoot(state, root);
    const sessionFiles: Record<string, string[]> = {};
    for (const [key, entry] of state.sessions) {
      sessionFiles[extractSessionId(key)] = Array.from(entry.files);
    }
    state.cachedSnapshot = { reports, sessionFiles };
    log.info(`[conflictMonitor] snapshot: ${reports.length} conflict(s) root=${root}`);
    emitter.emit('snapshot', state.cachedSnapshot);
  } catch (err) {
    log.warn('[conflictMonitor] recompute error:', err);
  }
}

// ── Monitor method implementations ───────────────────────────────────────────

function scheduleRecompute(
  state: MonitorState,
  emitter: EventEmitter,
  root: string,
): void {
  const existing = state.debounceTimers.get(root);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    state.debounceTimers.delete(root);
    void recompute(state, emitter, root);
  }, 200);
  state.debounceTimers.set(root, timer);
}

interface EditArgs { projectRoot: string; sessionId: string; filePath: string }

function implRecordEdit(state: MonitorState, emitter: EventEmitter, args: EditArgs): void {
  const { projectRoot, sessionId, filePath } = args;
  log.info(`[conflictMonitor:reception] root=${projectRoot} session=${sessionId} file=${filePath}`);
  const entry = getOrCreateEntry(state.sessions, projectRoot, sessionId);
  entry.files.add(filePath);
  entry.latestFile = filePath;
  scheduleRecompute(state, emitter, projectRoot);
}

function implDismiss(state: MonitorState, sessionA: string, sessionB: string): void {
  const pair = pairKey(sessionA, sessionB);
  let filesA = new Set<string>();
  let filesB = new Set<string>();
  for (const [key, entry] of state.sessions) {
    const sid = extractSessionId(key);
    if (sid === sessionA) filesA = new Set(entry.files);
    if (sid === sessionB) filesB = new Set(entry.files);
  }
  state.dismissedPairs.set(pair, { filesA, filesB });
  log.info(`[conflictMonitor] dismissed pair ${sessionA} ↔ ${sessionB}`);
}

function implGetSnapshot(
  state: MonitorState,
  projectRoot?: string,
): AgentConflictSnapshot {
  if (!projectRoot) return state.cachedSnapshot;
  const reports = state.cachedSnapshot.reports.filter((r) =>
    state.sessions.has(rootSessionKey(projectRoot, r.sessionA)),
  );
  return { ...state.cachedSnapshot, reports };
}

function implDispose(state: MonitorState, emitter: EventEmitter): void {
  for (const timer of state.debounceTimers.values()) clearTimeout(timer);
  state.debounceTimers.clear();
  state.sessions.clear();
  state.dismissedPairs.clear();
  emitter.removeAllListeners();
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createConflictMonitor(): ConflictMonitor {
  const emitter = new EventEmitter() as ConflictMonitor;
  const state = makeState();

  (emitter as unknown as { recordEdit: ConflictMonitor['recordEdit'] }).recordEdit =
    (root, sid, file) => implRecordEdit(state, emitter, { projectRoot: root, sessionId: sid, filePath: file });

  (emitter as unknown as { dismiss: ConflictMonitor['dismiss'] }).dismiss =
    (a, b) => implDismiss(state, a, b);

  (emitter as unknown as { getSnapshot: ConflictMonitor['getSnapshot'] }).getSnapshot =
    (root?) => implGetSnapshot(state, root);

  (emitter as unknown as { dispose: ConflictMonitor['dispose'] }).dispose =
    () => implDispose(state, emitter);

  return emitter;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _monitor: ConflictMonitor | null = null;

export function getConflictMonitor(): ConflictMonitor {
  if (!_monitor) _monitor = createConflictMonitor();
  return _monitor;
}

export function initConflictMonitor(): ConflictMonitor {
  _monitor?.dispose();
  _monitor = createConflictMonitor();
  log.info('[conflictMonitor] initialized');
  return _monitor;
}

export function disposeConflictMonitor(): void {
  _monitor?.dispose();
  _monitor = null;
}
