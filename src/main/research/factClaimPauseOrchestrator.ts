/**
 * factClaimPauseOrchestrator.ts — Impure glue: stream-coupled fact-claim research trigger.
 *
 * Wave 30 Phase F. Called per streamed text chunk. When a fact-shaped claim is
 * detected, the library is stale, and no cached artifact exists, this fires
 * research and awaits it up to maxLatencyMs before returning (unblocking the
 * stream). Never throws.
 *
 * Feature-flag behaviour:
 *   research.auto === false AND mode !== 'aggressive'
 *     → records observation telemetry only; does NOT fire research.
 *   research.auto === false AND mode === 'aggressive'
 *     → fires research (per-session aggressive opt-in overrides the global flag).
 */

import crypto from 'node:crypto';

import { app } from 'electron';
import path from 'path';

import { getConfigValue } from '../config';
import { getTelemetryStore } from '../telemetry';
import { detectFactClaims } from './factClaimDetector';
import type { FactClaimPattern } from './factClaimPatterns';
import { getModelCutoffDate } from './modelTrainingCutoffs';
import { cacheKey, getResearchCache } from './researchCache';
import { getResearchMode } from './researchSessionState';
import * as researchSubagent from './researchSubagent';
import { isStale } from './stalenessMatrix';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FactClaimPauseInput {
  sessionId: string;
  modelId: string | undefined;
  chunk: string;
  emitStatusChunk: (text: string) => void;
  maxLatencyMs?: number;
}

// ─── In-flight deduplication ──────────────────────────────────────────────────

// Map<sessionId, Set<library>> — tracks libraries with research in-flight per session.
const inFlight = new Map<string, Set<string>>();

function isInFlight(sessionId: string, library: string): boolean {
  return inFlight.get(sessionId)?.has(library) ?? false;
}

function markInFlight(sessionId: string, library: string): void {
  const set = inFlight.get(sessionId) ?? new Set<string>();
  set.add(library);
  inFlight.set(sessionId, set);
}

function clearInFlight(sessionId: string, library: string): void {
  inFlight.get(sessionId)?.delete(library);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDbPath(): string {
  try {
    return path.join(app.getPath('userData'), 'research-cache.db');
  } catch {
    return path.join(process.cwd(), 'research-cache.db');
  }
}

function isCached(library: string): boolean {
  try {
    const cache = getResearchCache(resolveDbPath());
    return cache.get(cacheKey(library, library)) !== null;
  } catch {
    return false;
  }
}

function resolveGlobalFlag(): boolean {
  try {
    const cfg = getConfigValue('research' as keyof import('../config').AppConfig) as
      | { auto?: boolean }
      | undefined;
    return cfg?.auto ?? false;
  } catch {
    return false;
  }
}

function recordTraceSafe(
  eventType: string,
  payload: Record<string, unknown>,
  sessionId: string,
): void {
  try {
    const store = getTelemetryStore();
    if (!store) return;
    store.recordTrace({
      id: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      sessionId,
      phase: eventType,
      payload,
    });
  } catch {
    // Telemetry must never affect the stream pipeline
  }
}

// ─── Per-match handler ────────────────────────────────────────────────────────

interface MatchHandlerDeps {
  runResearch: typeof researchSubagent.runResearch;
  isCachedFn: (library: string) => boolean;
  globalFlag: boolean;
}

interface MatchHandlerInput {
  sessionId: string;
  modelId: string | undefined;
  library: string;
  confidence: FactClaimPattern['confidence'];
  offset: number;
  emitStatusChunk: (text: string) => void;
  maxLatencyMs: number;
}

async function handleMatch(
  input: MatchHandlerInput,
  deps: MatchHandlerDeps,
): Promise<void> {
  const { sessionId, modelId, library, confidence, offset, emitStatusChunk, maxLatencyMs } = input;
  const { runResearch, isCachedFn, globalFlag } = deps;

  const mode = getResearchMode(sessionId);

  if (mode === 'off') return;

  const modelCutoff = getModelCutoffDate(modelId);
  const staleness = isStale(library, undefined, modelCutoff);
  if (!staleness.stale) return;

  if (isCachedFn(library)) return;

  if (isInFlight(sessionId, library)) return;

  const shouldFire = globalFlag || mode === 'aggressive';

  if (!shouldFire) {
    // Flag off and not aggressive — record observation only
    recordTraceSafe('fact-claim-match-observed', { library, confidence, offset, sessionId }, sessionId);
    return;
  }

  recordTraceSafe('fact-claim-fire', { library, confidence, offset, sessionId }, sessionId);

  markInFlight(sessionId, library);
  emitStatusChunk(`_checking ${library}…_`);

  const researchPromise = runResearch({
    topic: library,
    library,
    sessionId,
    triggerReason: 'auto',
  }).finally(() => {
    clearInFlight(sessionId, library);
  });

  const raceResult = await Promise.race([researchPromise, delay(maxLatencyMs)]);

  if (raceResult === undefined) {
    // delay won — research timed out relative to the budget
    recordTraceSafe('fact-claim-timeout', { library, confidence, sessionId, maxLatencyMs }, sessionId);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check a streamed text chunk for fact-shaped claims. If a stale, uncached,
 * not-in-flight library is detected, emits a status chunk and awaits research
 * up to maxLatencyMs (default 800ms) before returning.
 *
 * Only the first actionable match per chunk is processed to avoid fan-out.
 * Never throws.
 */
export async function maybePauseForFactClaim(input: FactClaimPauseInput): Promise<void> {
  try {
    const { sessionId, modelId, chunk, emitStatusChunk, maxLatencyMs = 800 } = input;

    const matches = detectFactClaims(chunk);
    if (matches.length === 0) return;

    const globalFlag = resolveGlobalFlag();

    const deps: MatchHandlerDeps = {
      runResearch: researchSubagent.runResearch,
      isCachedFn: isCached,
      globalFlag,
    };

    // Process only the first match per chunk to avoid fan-out latency accumulation
    for (const match of matches) {
      const mode = getResearchMode(sessionId);
      if (mode === 'off') return;

      const modelCutoff = getModelCutoffDate(modelId);
      const staleness = isStale(match.library, undefined, modelCutoff);
      if (!staleness.stale) continue;
      if (isCached(match.library)) continue;
      if (isInFlight(sessionId, match.library)) continue;

      await handleMatch(
        {
          sessionId,
          modelId,
          library: match.library,
          confidence: match.confidence,
          offset: match.offset,
          emitStatusChunk,
          maxLatencyMs,
        },
        deps,
      );
      return; // only one match per chunk
    }
  } catch (e) {
    console.warn('[fact-claim]', e);
  }
}

/** @internal Test-only — clear in-flight state. */
export function resetInFlightForTests(): void {
  inFlight.clear();
}
