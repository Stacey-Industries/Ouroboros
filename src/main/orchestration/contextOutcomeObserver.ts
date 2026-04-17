/**
 * contextOutcomeObserver.ts — Per-turn tool-call observer that emits ContextOutcome records.
 *
 * Tracks which files the agent Read/Edited during a turn and compares them against
 * the files that were included in the context packet for that turn, then classifies:
 *   used   — in packet AND touched by a file-touching tool
 *   missed — touched by a file-touching tool but NOT in packet
 *   unused — in packet AND not touched during the turn
 *
 * Outcomes are written to context-outcomes.jsonl via the ContextOutcomeWriter singleton.
 * Gated by the `context.decisionLogging` config flag (same flag as Phase A decisions).
 *
 * Disambiguates from the Wave 15 telemetry outcomeObserver (src/main/telemetry/outcomeObserver.ts),
 * which tracks PTY-exit and conflict outcomes against the telemetry DB store.
 */

import log from '../logger';
import { attributeResearchOutcome } from './contextOutcomeObserverResearch';
import { buildOutcomeBase } from './contextOutcomeObserverSupport';
import type { ContextOutcomeWriter } from './contextOutcomeWriter';
import { getOutcomeWriter } from './contextOutcomeWriter';
import type { ContextOutcome } from './contextTypes';

// ─── Tool normalisation ───────────────────────────────────────────────────────

/**
 * Tools that constitute a "file touch" — any of these accessing a path means
 * the agent read or wrote that file during the turn.
 */
const FILE_TOUCHING_TOOLS = new Set([
  'Read',
  'read_file',
  'view_file',
  'Edit',
  'edit_file',
  'Write',
  'write_file',
  'MultiEdit',
]);

/**
 * Extract the file path from the tool's argument object regardless of which
 * field name the tool uses (path / filePath / file_path).
 */
function extractPath(args: { path?: string; filePath?: string; file_path?: string }): string | undefined {
  return args.path ?? args.filePath ?? args.file_path;
}

function isFileTouchingTool(toolName: string): boolean {
  return FILE_TOUCHING_TOOLS.has(toolName);
}

// ─── Feature-flag accessor ────────────────────────────────────────────────────

type FlagGetter = () => boolean;

let getFlagValue: FlagGetter = defaultFlagGetter;

interface ContextConfig {
  decisionLogging?: boolean;
}

function defaultFlagGetter(): boolean {
  try {
    // Dynamic require avoids a circular-import at module load time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- config is a trusted internal module
    const { getConfigValue } = require('../config') as { getConfigValue: (k: string) => unknown };
    const ctx = getConfigValue('context') as ContextConfig | null | undefined;
    if (ctx && typeof ctx.decisionLogging === 'boolean') {
      return ctx.decisionLogging;
    }
  } catch {
    // Config not ready yet (e.g. during unit tests) — default on
  }
  return true;
}

/** @internal Override the flag getter (used in tests). */
export function _setFlagGetterForTests(getter: FlagGetter): void {
  getFlagValue = getter;
}

/** @internal Reset the flag getter to production default. */
export function _resetFlagGetterForTests(): void {
  getFlagValue = defaultFlagGetter;
}

// ─── Writer injection ─────────────────────────────────────────────────────────

let injectedWriter: ContextOutcomeWriter | null = null;

/**
 * Inject a specific writer for tests. In production the singleton from
 * contextOutcomeWriter is used automatically.
 */
export function initContextOutcomeObserver(writer: ContextOutcomeWriter): void {
  injectedWriter = writer;
}

function resolveWriter(): ContextOutcomeWriter | null {
  return injectedWriter ?? getOutcomeWriter();
}

// ─── Turn state ───────────────────────────────────────────────────────────────

interface IncludedFile {
  fileId: string;
  path: string;
}

interface TurnState {
  traceId: string;
  sessionId: string;
  workspaceRoot: string;
  includedFiles: IncludedFile[];
  /** Normalised paths touched by file-touching tools → tool name used. */
  touchedPaths: Map<string, string>;
}

/** Active turns keyed by turnId (= traceId from packet build). */
const activeTurns = new Map<string, TurnState>();

/**
 * Maps hook sessionId (= chat threadId for synthetic events) → active traceId.
 * Populated by `registerSessionTrace` when a session's traceId becomes known,
 * so that `observeToolCallBySession` can look up the correct turn.
 */
const sessionTraceMap = new Map<string, string>();

// ─── Path normalisation (consistent with contextTypes key format) ─────────────

function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called at the start of a turn (when a context packet is built for a send).
 *
 * @param turnId        Stable identifier for this turn. Equals traceId when called
 *                      from contextPacketBuilderDecisions.ts.
 * @param traceId       Router trace ID — links Phase A decisions to Phase B outcomes.
 * @param includedFiles Files that were included in the context packet for this turn.
 * @param sessionId     Chat session / thread ID for group-by-session queries.
 * @param workspaceRoot Absolute path to the workspace root for fileId normalisation.
 */
// eslint-disable-next-line max-params
export function recordTurnStart(
  turnId: string,
  traceId: string,
  includedFiles: IncludedFile[],
  sessionId = '',
  workspaceRoot = '',
): void {
  activeTurns.set(turnId, {
    traceId,
    sessionId,
    workspaceRoot,
    includedFiles,
    touchedPaths: new Map(),
  });
  log.info(
    `[contextOutcomeObserver] turn start turnId=${turnId} traceId=${traceId} ` +
      `includedFiles=${includedFiles.length}`,
  );
}

/**
 * Associate a hook sessionId with a traceId so that `observeToolCallBySession`
 * can route tool events to the correct active turn.
 */
export function registerSessionTrace(sessionId: string, traceId: string): void {
  sessionTraceMap.set(sessionId, traceId);
  log.info(
    `[contextOutcomeObserver] session trace registered sessionId=${sessionId} traceId=${traceId}`,
  );
}

/**
 * Called when a tool-use event arrives during a turn. Ignores non-file-touching
 * tools silently.
 */
export function observeToolCall(
  turnId: string,
  toolName: string,
  args: { path?: string; filePath?: string; file_path?: string },
): void {
  if (!isFileTouchingTool(toolName)) return;
  const filePath = extractPath(args);
  if (!filePath) return;

  const state = activeTurns.get(turnId);
  if (!state) return; // turn not registered — e.g. non-logged session

  const key = normalisePath(filePath);
  if (!state.touchedPaths.has(key)) {
    state.touchedPaths.set(key, toolName);
    log.info(
      `[contextOutcomeObserver] tool touch turnId=${turnId} tool=${toolName} path=${filePath}`,
    );
  }
}

/**
 * Route a tool-use event from a hook sessionId to the correct active turn.
 * Also calls research outcome correlation (Wave 25 Phase D) for file-touching tools.
 */
export function observeToolCallBySession(
  sessionId: string,
  toolName: string,
  args: { path?: string; filePath?: string; file_path?: string },
): void {
  const traceId = sessionTraceMap.get(sessionId);
  if (!traceId) return;
  observeToolCall(traceId, toolName, args);
  if (isFileTouchingTool(toolName)) {
    const filePath = extractPath(args);
    if (filePath) attributeResearchOutcome(sessionId, toolName, filePath);
  }
}

/**
 * Called at the end of a turn. Computes outcomes for all included files plus
 * any missed files, passes them to the writer, and removes the turn state.
 *
 * @returns The emitted outcomes (for testing / introspection).
 */
export function recordTurnEnd(turnId: string): ContextOutcome[] {
  const state = activeTurns.get(turnId);
  activeTurns.delete(turnId);

  if (!state) return [];
  if (!getFlagValue()) return [];

  const writer = resolveWriter();
  if (!writer) {
    log.warn('[contextOutcomeObserver] no writer — outcomes dropped');
    return [];
  }

  const outcomes = buildOutcomes(state);
  for (const outcome of outcomes) {
    writer.recordOutcome(outcome);
  }

  log.info(
    `[contextOutcomeObserver] turn end turnId=${turnId} traceId=${state.traceId} ` +
      `outcomes=${outcomes.length} (used=${outcomes.filter((o) => o.kind === 'used').length} ` +
      `unused=${outcomes.filter((o) => o.kind === 'unused').length} ` +
      `missed=${outcomes.filter((o) => o.kind === 'missed').length})`,
  );

  return outcomes;
}

/**
 * End the active turn for a session by looking up its traceId.
 * Cleans up the sessionTraceMap entry. No-op if session has no registered trace.
 */
export function recordTurnEndBySession(sessionId: string): ContextOutcome[] {
  const traceId = sessionTraceMap.get(sessionId);
  sessionTraceMap.delete(sessionId);
  if (!traceId) return [];
  return recordTurnEnd(traceId);
}

// ─── Outcome building ─────────────────────────────────────────────────────────

function buildOutcomes(state: TurnState): ContextOutcome[] {
  const outcomes: ContextOutcome[] = [];
  const includedKeys = new Set<string>();

  for (const file of state.includedFiles) {
    const key = normalisePath(file.path);
    includedKeys.add(key);
    const toolUsed = state.touchedPaths.get(key);
    const base = buildOutcomeBase({
      rawPath: file.path,
      workspaceRoot: state.workspaceRoot,
      traceId: state.traceId,
      sessionId: state.sessionId,
      kind: toolUsed !== undefined ? 'used' : 'unused',
      toolUsed,
    });
    outcomes.push({ ...base, decisionId: file.fileId });
  }

  for (const [touchedKey, toolUsed] of state.touchedPaths) {
    if (!includedKeys.has(touchedKey)) {
      const base = buildOutcomeBase({
        rawPath: touchedKey,
        workspaceRoot: state.workspaceRoot,
        traceId: state.traceId,
        sessionId: state.sessionId,
        kind: 'missed',
        toolUsed,
      });
      outcomes.push({ ...base, decisionId: touchedKey });
    }
  }

  return outcomes;
}

// ─── Singleton reset (test-only) ──────────────────────────────────────────────

/** @internal Clears all in-flight turn state and injected writer between tests. */
export function _resetContextOutcomeObserverForTests(): void {
  activeTurns.clear();
  sessionTraceMap.clear();
  injectedWriter = null;
}
