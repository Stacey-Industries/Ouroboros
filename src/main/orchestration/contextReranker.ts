/**
 * contextReranker.ts — Haiku-powered candidate reranker for context packet building.
 *
 * Calls `claude --model haiku --print` with a structured prompt and uses the
 * returned JSON order to reorder the candidate list before byte-budget enforcement.
 *
 * All failure paths (timeout, parse error, auth error, too-few candidates) return
 * the original candidate list unchanged — the reranker MUST NEVER break packet build.
 */

import { store } from '../config';
import log from '../logger';
import { spawnHaikuForRerank } from './contextRerankerSpawn';
import type { RankedContextFile } from './types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RerankCandidate {
  path: string;
  snippetPreview: string;
}

export interface RerankOptions {
  timeoutMs?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RERANK_THRESHOLD = 15;
const SNIPPET_PREVIEW_CHARS = 200;
const DEFAULT_TIMEOUT_MS = 500;

// ─── Prompt building ──────────────────────────────────────────────────────────

/**
 * Build the rerank prompt sent to the Haiku CLI.
 * Pure function — no I/O, fully testable.
 */
export function buildRerankPrompt(
  userGoal: string,
  candidates: { path: string; snippetPreview: string }[],
): string {
  const fileList = candidates
    .map((c, i) => {
      const preview = c.snippetPreview.slice(0, SNIPPET_PREVIEW_CHARS);
      return `${i + 1}. ${c.path}\n   ${preview}`;
    })
    .join('\n');

  return [
    'Rerank these files by relevance to the user\'s goal.',
    'Return JSON: {"order": ["path1", "path2", ...]}',
    '',
    `Goal: ${userGoal}`,
    '',
    'Files:',
    fileList,
  ].join('\n');
}

// ─── Output parsing ───────────────────────────────────────────────────────────

/**
 * Extract the reranked path order from CLI output.
 * Returns null on any parse failure or if the returned paths don't overlap
 * with the original set.
 */
export function parseRerankedOrder(output: string, originalPaths: string[]): string[] | null {
  const originalSet = new Set(originalPaths);

  // The CLI may wrap the JSON in markdown fences or surrounding text.
  // Try to extract the first {...} block.
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).order)
  ) {
    return null;
  }

  const order = (parsed as { order: unknown[] }).order;

  // Filter to only paths that appear in the original set
  const filtered = order.filter((p): p is string => typeof p === 'string' && originalSet.has(p));

  if (filtered.length === 0) return null;

  return filtered;
}

// ─── Reorder helper ───────────────────────────────────────────────────────────

/**
 * Apply a reranked path order to a candidate array.
 * Paths present in `order` come first (in order), followed by any candidates
 * not mentioned in the reranked list (preserving their original relative order).
 */
function applyOrder<T extends RerankCandidate>(candidates: T[], order: string[]): T[] {
  const orderIndex = new Map(order.map((p, i) => [p, i]));
  const ranked: T[] = [];
  const unranked: T[] = [];

  for (const c of candidates) {
    if (orderIndex.has(c.path)) {
      ranked.push(c);
    } else {
      unranked.push(c);
    }
  }

  ranked.sort((a, b) => (orderIndex.get(a.path) ?? 0) - (orderIndex.get(b.path) ?? 0));
  return [...ranked, ...unranked];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Rerank a candidate list using a short-lived Haiku CLI call.
 *
 * Returns candidates unchanged if:
 *   - candidates.length < RERANK_THRESHOLD (15)
 *   - spawn times out or exits non-zero
 *   - CLI output is not parseable JSON with a valid `order` array
 *   - any other error occurs
 *
 * All fallbacks are logged at warn level.
 */
export async function rerankCandidates<T extends RerankCandidate>(
  userGoal: string,
  candidates: T[],
  opts: RerankOptions = {},
): Promise<T[]> {
  if (candidates.length < RERANK_THRESHOLD) return candidates;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildRerankPrompt(
    userGoal,
    candidates.map((c) => ({ path: c.path, snippetPreview: c.snippetPreview })),
  );

  let spawnResult: Awaited<ReturnType<typeof spawnHaikuForRerank>>;
  try {
    spawnResult = await spawnHaikuForRerank(prompt, timeoutMs);
  } catch (err) {
    log.warn('[contextReranker] spawn threw unexpectedly, using original order:', err);
    return candidates;
  }

  if (!spawnResult.success || !spawnResult.output) {
    log.warn(
      '[contextReranker] spawn failed (%s), using original order (latency: %dms)',
      spawnResult.error ?? 'no output',
      spawnResult.latencyMs,
    );
    return candidates;
  }

  const order = parseRerankedOrder(spawnResult.output, candidates.map((c) => c.path));
  if (!order) {
    log.warn(
      '[contextReranker] could not parse rerank JSON from output, using original order',
    );
    return candidates;
  }

  log.info(
    '[contextReranker] reranked %d candidates in %dms',
    candidates.length,
    spawnResult.latencyMs,
  );

  return applyOrder(candidates, order);
}

/**
 * Convenience wrapper for contextPacketBuilder — adapts RankedContextFile[] to
 * RerankCandidate[] and back, using reasons[0].detail as the snippet preview.
 * Reads context.rerankerEnabled from config; returns original array if disabled.
 */
export async function rerankRankedFiles(
  goal: string,
  files: RankedContextFile[],
  opts: RerankOptions = {},
): Promise<RankedContextFile[]> {
  if (store.get('context')?.rerankerEnabled === false) return files;
  const candidates = files.map((f) => ({ path: f.filePath, snippetPreview: f.reasons[0]?.detail ?? '', _file: f }));
  const reranked = await rerankCandidates(goal, candidates, opts);
  return reranked.map((c) => c._file);
}
