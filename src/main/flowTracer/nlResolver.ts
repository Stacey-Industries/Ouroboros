/**
 * nlResolver.ts — Natural-language → symbol resolver (Wave 85 Phase 6).
 *
 * ADR Decision 4: single Haiku CLI invocation with bounded candidate list
 * (~30-80 entries for Agent IDE). No embedding infrastructure required.
 *
 * Candidate extraction:
 *   - Prefer Phase 5's extractEntryPointCandidates() from canonicalFlows.ts
 *     if it exists. Imports are tried at module load via dynamic import guard.
 *   - Fallback: local extraction via graph search_graph tool (UI event
 *     handlers + IPC handlers). Runs on first resolve call, result cached
 *     for the process lifetime.
 *
 * Circuit-breaker: 3 consecutive failures → open for 60 s (mirrors narrationCache).
 *
 * Auth constraint: ALL LLM calls go through spawnClaude. No direct API calls.
 */

import type { EntryPointCandidate, NLResolveResult } from '../../shared/types/flowTracer';
import { spawnClaude } from '../claudeMdGeneratorSupport';
import { getConfigValue } from '../config';
import log from '../logger';
import type { CandidateInput } from './nlResolverPrompt';
import { buildNLResolverPrompt, parseNLResolverResponse } from './nlResolverPrompt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_ATTEMPTS = 2;
const CIRCUIT_OPEN_AFTER = 3;
const CIRCUIT_RESET_MS = 60_000; // 60 s

// ---------------------------------------------------------------------------
// Circuit breaker (module-level, mirrors narrationCache pattern)
// ---------------------------------------------------------------------------

let consecutiveFailures = 0;
let circuitOpenAt: number | null = null;

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_OPEN_AFTER) return false;
  if (circuitOpenAt !== null && Date.now() - circuitOpenAt >= CIRCUIT_RESET_MS) {
    consecutiveFailures = 0;
    circuitOpenAt = null;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenAt = null;
}

function recordFailure(): void {
  consecutiveFailures = Math.min(consecutiveFailures + 1, CIRCUIT_OPEN_AFTER);
  if (consecutiveFailures >= CIRCUIT_OPEN_AFTER && circuitOpenAt === null) {
    circuitOpenAt = Date.now();
  }
}

/** Exported for test access only. */
export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenAt = null;
}

export function getCircuitBreakerState(): { open: boolean; failures: number } {
  return { open: isCircuitOpen(), failures: consecutiveFailures };
}

// ---------------------------------------------------------------------------
// Workspace root resolution
// ---------------------------------------------------------------------------

function resolveWorkspaceRoot(): string | null {
  try {
    const root = getConfigValue('defaultProjectRoot') as string | undefined;
    return root && root.length > 0 ? root : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Candidate extraction helpers
// ---------------------------------------------------------------------------

/** In-process cache of candidates; lives for the process lifetime. */
let cachedCandidates: CandidateInput[] | null = null;

/** Infer the layer ('renderer' | 'main' | 'preload') from a file path. */
export function inferLayer(file: string): string {
  if (file.includes('/renderer/') || file.includes('\\renderer\\')) return 'renderer';
  if (file.includes('/preload/') || file.includes('\\preload\\')) return 'preload';
  return 'main';
}

/**
 * Build CandidateInput[] from raw EntryPointCandidate[].
 * Exported for test injection.
 */
export function candidatesToInputs(candidates: EntryPointCandidate[]): CandidateInput[] {
  return candidates.map((c) => ({
    symbol: c.symbol,
    file: c.file,
    line: c.line,
    layer: inferLayer(c.file),
  }));
}

/**
 * Attempt to use Phase 5's extractEntryPointCandidates() if available.
 * Returns null if canonicalFlows.ts doesn't exist yet.
 */
async function tryPhase5Extraction(): Promise<CandidateInput[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import('./canonicalFlows')) as any;
    if (typeof mod.extractEntryPointCandidates !== 'function') return null;
    const raw = (await mod.extractEntryPointCandidates()) as EntryPointCandidate[];
    return candidatesToInputs(raw);
  } catch {
    return null; // canonicalFlows.ts not present — expected during parallel Phase 5/6
  }
}

// ---------------------------------------------------------------------------
// Graph-based candidate extraction (fallback)
// ---------------------------------------------------------------------------

function hitToInput(hit: Record<string, unknown>): CandidateInput | null {
  if (typeof hit.symbol !== 'string' || typeof hit.file !== 'string') return null;
  return {
    symbol: hit.symbol,
    file: hit.file,
    line: typeof hit.line === 'number' ? hit.line : 0,
    layer: inferLayer(hit.file),
  };
}

function queryGraphSet(
  ctrl: { searchGraph: (q: string, limit?: number) => unknown[] },
  query: string,
  limit: number,
): CandidateInput[] {
  let hits: unknown[] = [];
  try {
    hits = ctrl.searchGraph(query, limit);
  } catch {
    return [];
  }
  const results: CandidateInput[] = [];
  for (const hit of hits) {
    if (hit && typeof hit === 'object') {
      const input = hitToInput(hit as Record<string, unknown>);
      if (input) results.push(input);
    }
  }
  return results;
}

/**
 * Extract entry-point candidates from the codebase-memory graph.
 * Queries renderer event handlers + main IPC handlers (~30-80 nodes).
 * Returns empty array on graph unavailability (graceful degradation).
 *
 * This is the fallback path. Phase 5's `extractEntryPointCandidates` is
 * preferred and tried first by `getCandidates`; this only fires when
 * Phase 5's module isn't loadable.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function extractCandidatesFromGraph(_workspaceRoot: string): Promise<CandidateInput[]> {
  try {
    const { getGraphController } = await import('../codebaseGraph/graphControllerSupport');
    const ctrl = getGraphController();
    if (!ctrl) return [];
    const rendererHits = queryGraphSet(
      ctrl,
      'event handler submit send click keyboard input renderer',
      50,
    );
    const mainHits = queryGraphSet(ctrl, 'ipcMain handle ipc handler main process channel', 50);
    const seen = new Set(rendererHits.map((r) => `${r.file}:${r.line}`));
    const merged = [...rendererHits];
    for (const hit of mainHits) {
      if (!seen.has(`${hit.file}:${hit.line}`)) merged.push(hit);
    }
    return merged.slice(0, 80); // cap per ADR Decision 4
  } catch {
    return [];
  }
}

async function getCandidates(workspaceRoot: string): Promise<CandidateInput[]> {
  if (cachedCandidates !== null) return cachedCandidates;

  const phase5Result = await tryPhase5Extraction();
  if (phase5Result !== null && phase5Result.length > 0) {
    cachedCandidates = phase5Result;
    log.info('[nlResolver] candidates from Phase 5:', phase5Result.length);
    return phase5Result;
  }

  const graphResult = await extractCandidatesFromGraph(workspaceRoot);
  if (graphResult.length > 0) {
    cachedCandidates = graphResult;
    log.info('[nlResolver] candidates from graph fallback:', graphResult.length);
    return graphResult;
  }

  log.info('[nlResolver] no candidates extracted — resolver will return empty');
  return [];
}

/** Exported for test injection — allows bypassing graph calls. */
export function setCandidateCache(candidates: CandidateInput[] | null): void {
  cachedCandidates = candidates;
}

// ---------------------------------------------------------------------------
// CLI call with retry
// ---------------------------------------------------------------------------

async function callCliWithRetry(
  query: string,
  candidates: CandidateInput[],
): Promise<EntryPointCandidate[]> {
  const prompt = buildNLResolverPrompt(query, candidates);
  let lastText = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const text = await spawnClaude(prompt, MODEL);
      const parsed = parseNLResolverResponse(text);
      if (parsed.length > 0) {
        recordSuccess();
        return parsed;
      }
      lastText = text;
      if (attempt === 0) {
        log.info('[nlResolver] empty parse, retrying. First 200:', text.slice(0, 200));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0) log.info('[nlResolver] CLI error, retrying:', msg);
      lastText = msg;
    }
  }

  recordFailure();
  log.info('[nlResolver] failed after 2 attempts. Last output:', lastText.slice(0, 200));
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a natural-language query to a ranked list of entry-point candidates.
 *
 * - Empty query → immediate `{ matches: [], confidence: 0 }` (no CLI call).
 * - Circuit open → immediate `{ matches: [], confidence: 0 }`.
 * - confidence > 0.8 on top-1 → caller resolves directly.
 * - confidence ≤ 0.8 → caller shows disambiguation dropdown.
 */
export async function resolveNaturalLanguage(query: string): Promise<NLResolveResult> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return { matches: [], confidence: 0 };

  if (isCircuitOpen()) {
    log.info('[nlResolver] circuit open — skipping for query:', trimmed.slice(0, 60));
    return { matches: [], confidence: 0 };
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const candidates = workspaceRoot ? await getCandidates(workspaceRoot) : [];

  log.info('[nlResolver] resolving:', trimmed.slice(0, 60), '| candidates:', candidates.length);

  const matches = await callCliWithRetry(trimmed, candidates);
  const confidence = matches.length > 0 ? (matches[0].confidence ?? 0) : 0;

  log.info('[nlResolver] resolved', matches.length, 'matches, top confidence:', confidence);
  return { matches, confidence };
}
