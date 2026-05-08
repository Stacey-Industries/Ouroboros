/**
 * flowWhyCache.ts — Per-flow chain-aware Why narration cache (Wave 85 Phase 4).
 *
 * Cache location: <workspaceRoot>/.ouroboros/flows/<flowId>-why.json
 * Distinct from flowPersistence's <flowId>.json (no collision by design —
 * the `-why.json` suffix is different from `.json`).
 *
 * Pattern: mirrors narrationCache.ts (Phase 3) and moduleSummarizer.ts.
 *   - spawnClaude CLI subprocess, claude-haiku-4-5-20251001
 *   - 2-attempt retry per call
 *   - Circuit-breaker after 3 consecutive failures (module-level)
 *   - On-disk JSON cache at .ouroboros/flows/<flowId>-why.json
 *
 * Auth constraint: NO direct Anthropic API calls.
 */

import fs from 'fs/promises';
import path from 'path';

import type { FlowTrace, FlowWhyEntry, Narration } from '../../shared/types/flowTracer';
import { spawnClaude } from '../claudeMdGeneratorSupport';
import { getConfigValue } from '../config';
import log from '../logger';
import { buildFlowWhyPrompt, fillMissingWhyEntries, parseFlowWhyResponse } from './flowWhyPrompt';
import { getNarration } from './narrationCache';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_ATTEMPTS = 2;
const CIRCUIT_OPEN_AFTER = 3;

// ---------------------------------------------------------------------------
// Circuit breaker (module-level, matches narrationCache.ts pattern)
// ---------------------------------------------------------------------------

let consecutiveFailures = 0;

function isCircuitOpen(): boolean {
  return consecutiveFailures >= CIRCUIT_OPEN_AFTER;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures = Math.min(consecutiveFailures + 1, CIRCUIT_OPEN_AFTER);
}

/** Exported for testing only. */
export function resetWhyCircuitBreaker(): void {
  consecutiveFailures = 0;
}

export function getWhyCircuitBreakerState(): { open: boolean; failures: number } {
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
// Cache path helpers
// ---------------------------------------------------------------------------

function getWhyFlowsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.ouroboros', 'flows');
}

/** <workspaceRoot>/.ouroboros/flows/<flowId>-why.json */
function getWhyCachePath(workspaceRoot: string, flowId: string): string {
  return path.join(getWhyFlowsDir(workspaceRoot), `${flowId}-why.json`);
}

async function ensureWhyFlowsDir(workspaceRoot: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from config root
  await fs.mkdir(getWhyFlowsDir(workspaceRoot), { recursive: true });
}

interface WhyCacheFile {
  flowId: string;
  entries: FlowWhyEntry[];
  cachedAt: number;
}

async function readWhyCache(cachePath: string): Promise<WhyCacheFile | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from config root
    const raw = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(raw) as WhyCacheFile;
  } catch {
    return null;
  }
}

async function writeWhyCache(cachePath: string, file: WhyCacheFile): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from config root
  await fs.writeFile(cachePath, JSON.stringify(file), 'utf-8');
}

// ---------------------------------------------------------------------------
// Per-symbol narration lookup (Phase 3 integration)
// ---------------------------------------------------------------------------

async function buildPerSymbolNarrationMap(
  flow: FlowTrace,
): Promise<Map<string, Pick<Narration, 'what' | 'how'>>> {
  const map = new Map<string, Pick<Narration, 'what' | 'how'>>();
  for (const step of flow.steps) {
    const ref = { symbol: step.symbol, file: step.file, line: step.line };
    try {
      const result = await getNarration(ref);
      if (result && !('stale' in result)) {
        map.set(step.symbol, { what: result.what, how: result.how });
      }
    } catch {
      // Per-symbol miss is non-fatal; Haiku still gets chain context from
      // other steps that did cache-hit, and from file path + line metadata.
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Symbol body fetch (same approach as narrationCache.fetchSymbolBody)
// ---------------------------------------------------------------------------

async function fetchStepBodies(
  flow: FlowTrace,
  workspaceRoot: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const step of flow.steps) {
    try {
      const absPath = path.join(workspaceRoot, step.file);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from validated flow ref
      const content = await fs.readFile(absPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, step.line - 1);
      // Fetch generously; truncation is applied later in buildFlowWhyPrompt
      const end = Math.min(lines.length, start + 60);
      map.set(step.id, lines.slice(start, end).join('\n'));
    } catch {
      map.set(step.id, `// ${step.symbol} — body unavailable`);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// CLI call with retry
// ---------------------------------------------------------------------------

async function callCliWithRetry(flow: FlowTrace, workspaceRoot: string): Promise<FlowWhyEntry[]> {
  const [narrationMap, bodyMap] = await Promise.all([
    buildPerSymbolNarrationMap(flow),
    fetchStepBodies(flow, workspaceRoot),
  ]);

  const prompt = buildFlowWhyPrompt(flow, narrationMap, bodyMap);
  let lastOutput = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const stdout = await spawnClaude(prompt, MODEL);
      const parsed = parseFlowWhyResponse(stdout, flow);
      if (parsed.length > 0) {
        recordSuccess();
        return fillMissingWhyEntries(parsed, flow);
      }
      lastOutput = stdout;
      if (attempt === 0) {
        log.info(
          '[flowWhyCache] parse yielded no entries, retrying. Output:',
          stdout.slice(0, 200),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0) log.info('[flowWhyCache] CLI error, retrying:', msg);
      lastOutput = msg;
    }
  }

  recordFailure();
  log.info('[flowWhyCache] CLI failed after 2 attempts. Last output:', lastOutput.slice(0, 200));
  // Graceful degradation: return WHY_PLACEHOLDER for every step
  return fillMissingWhyEntries([], flow);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the cached Why entries for a flow.
 * Returns null on cache miss (no file, or file unreadable).
 */
export async function getFlowWhy(flowId: string): Promise<FlowWhyEntry[] | null> {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return null;

  const cachePath = getWhyCachePath(workspaceRoot, flowId);
  const file = await readWhyCache(cachePath);
  if (!file) return null;

  log.info('[flowWhyCache] cache hit for flow', flowId, '—', file.entries.length, 'entries');
  return file.entries;
}

/**
 * Generate chain-aware Why entries for a flow via a single Haiku CLI call.
 * Persists the result to <flowId>-why.json and returns the entries.
 */
export async function generateFlowWhy(flow: FlowTrace): Promise<FlowWhyEntry[]> {
  if (isCircuitOpen()) {
    log.info('[flowWhyCache] circuit open — returning placeholder Why for flow', flow.id);
    return fillMissingWhyEntries([], flow);
  }

  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) {
    log.info('[flowWhyCache] no workspace root — returning placeholder Why');
    return fillMissingWhyEntries([], flow);
  }

  log.info('[flowWhyCache] generating Why for flow', flow.id, '(', flow.steps.length, 'steps)');
  const entries = await callCliWithRetry(flow, workspaceRoot);

  try {
    await ensureWhyFlowsDir(workspaceRoot);
    const cachePath = getWhyCachePath(workspaceRoot, flow.id);
    const file: WhyCacheFile = { flowId: flow.id, entries, cachedAt: Date.now() };
    await writeWhyCache(cachePath, file);
    log.info('[flowWhyCache] persisted Why cache for flow', flow.id);
  } catch (err) {
    log.info('[flowWhyCache] failed to persist Why cache for flow', flow.id, err);
  }

  return entries;
}

/**
 * Delete the Why cache file for a flow.
 * Called when a flow is invalidated or deleted.
 */
export function invalidateFlowWhy(flowId: string): void {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return;

  const cachePath = getWhyCachePath(workspaceRoot, flowId);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from config root
  fs.unlink(cachePath).catch(() => {
    // File may not exist — that's fine
  });
  log.info('[flowWhyCache] invalidated Why cache for flow', flowId);
}
