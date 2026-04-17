/**
 * contextOutcomeObserverResearch.ts — Research outcome attribution helper
 * (Wave 25 Phase D, extended Wave 29.5 Phase F for H3).
 *
 * Called from contextOutcomeObserver.observeToolCallBySession for every
 * file-touching tool event. Asks the ResearchCorrelationStore whether this
 * session has a recent research invocation to attribute, and if so emits a
 * line to research-outcomes.jsonl via ResearchOutcomeWriter.
 *
 * Phase F additions:
 *  - toolKind   — derived from the tool name via the shared toolKindMap helper.
 *  - outcomeSignal — 'accepted' | 'reverted' | 'unknown' joined from revert events
 *                    (registerRevertListener) and tool-kind.
 *  - followupTestExit — exit code of the next PTY exit in the same session
 *                       within the attribution window (10 min), null if none.
 *
 * Lifecycle: call initResearchOutcomeObserverSignals() once at startup to wire
 * the revert listener and start receiving PTY exits. Call
 * closeResearchOutcomeObserverSignals() on app shutdown.
 */

import { registerRevertListener } from '../agentChat/chatOrchestrationBridgeGit';
import log from '../logger';
import { getResearchCorrelationStore } from '../research/researchCorrelation';
import type { ResearchOutcomeSignal } from '../research/researchOutcomeWriter';
import { getResearchOutcomeWriter } from '../research/researchOutcomeWriter';
import { deriveResearchToolKind } from '../telemetry/toolKindMap';

// ─── Per-session signal state ─────────────────────────────────────────────────

/** Attribution window: 10 minutes (mirrors researchCorrelation.ts). */
const ATTRIBUTION_WINDOW_MS = 10 * 60 * 1000;

interface PendingSignals {
  /** Absolute paths of files reverted within the window (populated by revert listener). */
  revertedPaths: Set<string>;
  /** Exit code of the first PTY exit in the session within the window, null if none yet. */
  followupTestExit: number | null;
  /** Timestamp when signals tracking began (first attribution in this session). */
  startedAt: number;
}

/** Map<sessionId, PendingSignals> — cleared when the session ends or window expires. */
const sessionSignals = new Map<string, PendingSignals>();

// ─── Session signal helpers ───────────────────────────────────────────────────

function getOrCreateSignals(sessionId: string): PendingSignals {
  let signals = sessionSignals.get(sessionId);
  if (!signals) {
    signals = { revertedPaths: new Set(), followupTestExit: null, startedAt: Date.now() };
    sessionSignals.set(sessionId, signals);
  }
  return signals;
}

function isWindowOpen(signals: PendingSignals): boolean {
  return Date.now() - signals.startedAt <= ATTRIBUTION_WINDOW_MS;
}

// ─── Revert listener ──────────────────────────────────────────────────────────

let unregisterRevert: (() => void) | null = null;

function onRevert(revertedPaths: string[]): void {
  for (const [, signals] of sessionSignals) {
    if (!isWindowOpen(signals)) continue;
    for (const p of revertedPaths) signals.revertedPaths.add(p);
  }
}

// ─── PTY exit signal ─────────────────────────────────────────────────────────

/**
 * Record a PTY exit for a session. Only the first exit within the attribution
 * window is captured — subsequent exits overwrite only if still null.
 */
export function notifyPtyExit(sessionId: string, exitCode: number | null): void {
  const signals = sessionSignals.get(sessionId);
  if (!signals || !isWindowOpen(signals)) return;
  if (signals.followupTestExit === null) {
    signals.followupTestExit = exitCode ?? null;
    log.info(
      `[contextOutcomeObserverResearch] PTY exit session=${sessionId} code=${exitCode}`,
    );
  }
}

// ─── outcomeSignal derivation ─────────────────────────────────────────────────

function deriveOutcomeSignal(
  filePath: string,
  toolName: string,
  signals: PendingSignals,
): ResearchOutcomeSignal {
  if (signals.revertedPaths.has(filePath)) return 'reverted';
  const kind = deriveResearchToolKind(toolName);
  if (kind === 'edit' || kind === 'write') return 'accepted';
  return 'unknown';
}

// ─── Public attribution API ───────────────────────────────────────────────────

/**
 * Attribute a file-touching tool call to a research invocation, if any.
 * Emits to research-outcomes.jsonl when attribution succeeds. No-op when no
 * research correlation store or writer is available.
 */
export function attributeResearchOutcome(
  sessionId: string,
  toolName: string,
  filePath: string,
): void {
  try {
    doAttributeResearchOutcome(sessionId, toolName, filePath);
  } catch (err) {
    log.warn('[contextOutcomeObserverResearch] attribution error', err);
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

function doAttributeResearchOutcome(
  sessionId: string,
  toolName: string,
  filePath: string,
): void {
  const correlationStore = getResearchCorrelationStore();

  const correlationId = correlationStore.attributeOutcome(sessionId, toolName, filePath);
  if (!correlationId) return;

  const invocations = correlationStore.summarizeSession(sessionId);
  const invocation = invocations.find((i) => i.correlationId === correlationId);
  if (!invocation) return;

  const writer = getResearchOutcomeWriter();
  if (!writer) return;

  const signals = getOrCreateSignals(sessionId);
  const toolKind = deriveResearchToolKind(toolName);
  const outcomeSignal = deriveOutcomeSignal(filePath, toolName, signals);

  writer.recordOutcome({
    correlationId,
    sessionId,
    topic: invocation.topic,
    toolName,
    toolKind,
    filePath,
    outcomeSignal,
    followupTestExit: signals.followupTestExit,
  });
  log.info(
    `[contextOutcomeObserverResearch] attributed correlationId=${correlationId} ` +
    `session=${sessionId} tool=${toolName} file=${filePath} ` +
    `signal=${outcomeSignal} testExit=${signals.followupTestExit}`,
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/** Wire the revert listener. Call once at startup. */
export function initResearchOutcomeObserverSignals(): void {
  if (unregisterRevert) return;
  unregisterRevert = registerRevertListener(onRevert);
  log.info('[contextOutcomeObserverResearch] revert listener registered');
}

/** Unregister the revert listener and clear session state. Call on shutdown. */
export function closeResearchOutcomeObserverSignals(): void {
  if (unregisterRevert) {
    unregisterRevert();
    unregisterRevert = null;
  }
  sessionSignals.clear();
}

/** @internal Test-only — reset module-level state between tests. */
export function _resetResearchOutcomeObserverSignalsForTests(): void {
  if (unregisterRevert) {
    unregisterRevert();
    unregisterRevert = null;
  }
  sessionSignals.clear();
}
