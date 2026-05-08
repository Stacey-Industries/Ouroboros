/**
 * narrationCache.ts — Per-symbol What+How narration cache.
 *
 * Wave 85 Phase 3. Matches the moduleSummarizer.ts pattern verbatim:
 *   - spawnClaude CLI subprocess with claude-haiku-4-5-20251001
 *   - 2-attempt retry per batch
 *   - Circuit-breaker after 3 consecutive failures (module-level counter)
 *   - Hash-based file cache at <workspaceRoot>/.ouroboros/narration-cache/<symbolHash>.json
 *   - Batch concurrency = 3 (matching summarizationQueue)
 *   - ~10 symbols per CLI invocation to amortize startup latency
 *
 * Why-field policy: `why` is populated with WHY_PLACEHOLDER for Phase 3.
 * Phase 4 replaces it with chain-aware whole-flow narration.
 *
 * Auth constraint: NO direct Anthropic API calls. All LLM goes through spawnClaude.
 */

import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import type { Narration, SymbolRef } from '../../shared/types/flowTracer';
import { spawnClaude } from '../claudeMdGeneratorSupport';
import { getConfigValue } from '../config';
import log from '../logger';
import {
  buildNarrationBatch,
  type NarrationSymbolInput,
  parseNarrationBatchResponse,
} from './narrationCachePrompt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 10; // symbols per CLI invocation
const CONCURRENCY = 3; // parallel CLI calls (matches moduleSummarizer)
const MAX_ATTEMPTS = 2; // retry attempts per batch
const CIRCUIT_OPEN_AFTER = 3; // consecutive failures before circuit opens

// ---------------------------------------------------------------------------
// Circuit breaker (module-level, matches moduleSummarizer pattern)
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

// Exported for testing only
export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
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
// Cache file helpers
// ---------------------------------------------------------------------------

function computeSymbolHash(ref: SymbolRef, body: string): string {
  return createHash('sha1')
    .update(ref.file)
    .update('\0')
    .update(String(ref.line))
    .update('\0')
    .update(body)
    .digest('hex');
}

function getCacheDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.ouroboros', 'narration-cache');
}

function getCachePath(workspaceRoot: string, symbolHash: string): string {
  return path.join(getCacheDir(workspaceRoot), `${symbolHash}.json`);
}

async function ensureCacheDir(workspaceRoot: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from config root
  await fs.mkdir(getCacheDir(workspaceRoot), { recursive: true });
}

interface CacheEntry {
  symbolHash: string;
  narration: Narration;
  cachedAt: number;
}

async function readCacheEntry(cachePath: string): Promise<CacheEntry | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from config root
    const raw = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCacheEntry(cachePath: string, entry: CacheEntry): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from config root
  await fs.writeFile(cachePath, JSON.stringify(entry), 'utf-8');
}

// ---------------------------------------------------------------------------
// Symbol body fetch (from graph or file fallback)
// ---------------------------------------------------------------------------

async function fetchSymbolBody(ref: SymbolRef, workspaceRoot: string): Promise<string> {
  // Try reading directly from source (no graph dependency for Phase 3)
  try {
    const absPath = path.join(workspaceRoot, ref.file);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from validated graph ref
    const content = await fs.readFile(absPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, ref.line - 1);
    const end = Math.min(lines.length, start + 60);
    const sliced = lines.slice(start, end).join('\n');
    // If the line-based slice doesn't include the symbol body, the graph's
    // recorded line is stale or wrong — search the file by name and re-slice.
    if (sliced.includes(ref.symbol)) return sliced;
    return rescueBodyByName(content, lines, ref.symbol) ?? sliced;
  } catch {
    return `// ${ref.symbol} — body unavailable`;
  }
}

function rescueBodyByName(_content: string, lines: string[], symbol: string): string | null {
  // Prefer declaration-shaped hits; fall back to the first occurrence.
  let firstOccurrence = -1;
  for (const [i, line] of lines.entries()) {
    const tokenIdx = wordBoundaryIndexOf(line, symbol);
    if (tokenIdx < 0) continue;
    if (firstOccurrence < 0) firstOccurrence = i;
    const after = line.charAt(tokenIdx + symbol.length);
    if (after === '(' || after === '=' || after === ':' || after === '<') {
      const end = Math.min(lines.length, i + 60);
      return lines.slice(i, end).join('\n');
    }
  }
  if (firstOccurrence < 0) return null;
  const end = Math.min(lines.length, firstOccurrence + 60);
  return lines.slice(firstOccurrence, end).join('\n');
}

function wordBoundaryIndexOf(line: string, token: string): number {
  let from = 0;
  while (true) {
    const idx = line.indexOf(token, from);
    if (idx < 0) return -1;
    const before = idx === 0 ? '' : line[idx - 1];
    if (!isWordChar(before)) return idx;
    from = idx + 1;
  }
}

function isWordChar(c: string): boolean {
  if (!c) return false;
  return /^[A-Za-z0-9_$]$/.test(c);
}

// ---------------------------------------------------------------------------
// Single-batch CLI call (2-attempt retry)
// ---------------------------------------------------------------------------

async function callCliWithRetry(inputs: NarrationSymbolInput[]): Promise<Map<string, Narration>> {
  const prompt = buildNarrationBatch(inputs);
  let lastText = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const text = await spawnClaude(prompt, MODEL);
      const result = parseNarrationBatchResponse(text, inputs);
      if (result.size > 0) {
        recordSuccess();
        return result;
      }
      // Haiku replied with a valid empty array — it parsed but couldn't generate
      // narration (e.g., symbol body wasn't in the supplied excerpt). Don't retry;
      // the next call will get the same response.
      if (isValidEmptyArrayResponse(text)) {
        recordSuccess();
        log.info(
          '[narrationCache] batch returned valid empty array — accepting, no retry',
        );
        return new Map();
      }
      lastText = text;
      if (attempt === 0) {
        log.info(
          '[narrationCache] batch parse empty, retrying (first 200 chars):',
          text.slice(0, 200),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0) log.info('[narrationCache] batch CLI error, retrying:', msg);
      lastText = msg;
    }
  }
  recordFailure();
  log.info('[narrationCache] batch failed after 2 attempts. Last output:', lastText.slice(0, 200));
  return new Map();
}

function isValidEmptyArrayResponse(text: string): boolean {
  const trimmed = text.trim();
  // Strip optional markdown fences around a JSON literal.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  const inner = (fenceMatch ? fenceMatch[1] : trimmed).trim();
  return inner === '[]';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get cached narration for a single symbol.
 * Returns:
 *   - Narration object if fresh cache hit
 *   - { stale: true } if cache exists but body has changed
 *   - null if no cache (triggers background generation)
 */
export async function getNarration(ref: SymbolRef): Promise<Narration | { stale: true } | null> {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return null;

  const body = await fetchSymbolBody(ref, workspaceRoot);
  const currentHash = computeSymbolHash(ref, body);
  const cachePath = getCachePath(workspaceRoot, currentHash);
  const entry = await readCacheEntry(cachePath);

  if (entry) {
    // Hash is part of the filename — a hit means the body hasn't changed
    return entry.narration;
  }

  // Check for any stale entry keyed to this file+line regardless of hash
  // (quick check: any .json in cache dir that mentions this file is stale)
  // For simplicity we just return null (miss) and let background generation handle it.
  // The stale-return path requires storing a secondary index; Phase 3 keeps it simple.
  return null;
}

/**
 * Generate narration for a single symbol and persist to cache.
 * Called as a background task — does not block the renderer.
 */
export async function generateNarration(ref: SymbolRef): Promise<Narration | null> {
  if (isCircuitOpen()) {
    log.info('[narrationCache] circuit open — skipping generation for', ref.symbol);
    return null;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return null;

  const body = await fetchSymbolBody(ref, workspaceRoot);
  const symbolHash = computeSymbolHash(ref, body);
  const cachePath = getCachePath(workspaceRoot, symbolHash);

  // Check again after async gap
  const existing = await readCacheEntry(cachePath);
  if (existing) return existing.narration;

  const inputs: NarrationSymbolInput[] = [{ symbolRef: ref, body }];
  const result = await callCliWithRetry(inputs);
  const narration = result.get(ref.symbol);
  if (!narration) return null;

  await ensureCacheDir(workspaceRoot);
  const entry: CacheEntry = { symbolHash, narration, cachedAt: Date.now() };
  await writeCacheEntry(cachePath, entry);
  return narration;
}

/**
 * Index-time batch generation. concurrency=3, ~10 symbols per CLI call.
 * Fire-and-forget at index time; does not block gallery render.
 */
export async function batchGenerateNarrations(refs: SymbolRef[]): Promise<void> {
  if (refs.length === 0) return;
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return;

  const inputs = await buildBatchInputs(refs, workspaceRoot);
  const batches = chunkArray(inputs, BATCH_SIZE);
  await runWithConcurrency(batches, workspaceRoot, CONCURRENCY);
}

async function buildBatchInputs(
  refs: SymbolRef[],
  workspaceRoot: string,
): Promise<NarrationSymbolInput[]> {
  const inputs: NarrationSymbolInput[] = [];
  for (const ref of refs) {
    const body = await fetchSymbolBody(ref, workspaceRoot);
    const symbolHash = computeSymbolHash(ref, body);
    const cachePath = getCachePath(workspaceRoot, symbolHash);
    const existing = await readCacheEntry(cachePath);
    if (!existing) inputs.push({ symbolRef: ref, body });
  }
  return inputs;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function processBatch(batch: NarrationSymbolInput[], workspaceRoot: string): Promise<void> {
  if (isCircuitOpen()) return;
  const results = await callCliWithRetry(batch);
  await ensureCacheDir(workspaceRoot);
  for (const [symbol, narration] of results) {
    const input = batch.find((b) => b.symbolRef.symbol === symbol);
    if (!input) continue;
    const symbolHash = computeSymbolHash(input.symbolRef, input.body);
    const cachePath = getCachePath(workspaceRoot, symbolHash);
    const entry: CacheEntry = { symbolHash, narration, cachedAt: Date.now() };
    await writeCacheEntry(cachePath, entry).catch((err) =>
      log.info('[narrationCache] write error for', symbol, err),
    );
  }
}

async function runWithConcurrency(
  batches: NarrationSymbolInput[][],
  workspaceRoot: string,
  concurrency: number,
): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < batches.length) {
      const batch = batches[idx++];
      if (batch) await processBatch(batch, workspaceRoot);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

/**
 * Invalidate cache for a symbol by deleting its hash-keyed file.
 * Called when the source file changes (hooked into graph file-change events).
 */
export async function invalidateNarration(ref: SymbolRef): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return;

  const body = await fetchSymbolBody(ref, workspaceRoot);
  const symbolHash = computeSymbolHash(ref, body);
  const cachePath = getCachePath(workspaceRoot, symbolHash);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from config root
    await fs.unlink(cachePath);
    log.info('[narrationCache] invalidated', ref.symbol);
  } catch {
    // File may not exist — that's fine
  }
}

// Re-export for test access to hash logic
export { computeSymbolHash };
