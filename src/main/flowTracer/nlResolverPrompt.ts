/**
 * nlResolverPrompt.ts — Prompt assembly and response parsing for the
 * natural-language → symbol resolver (Phase 6).
 *
 * Extracted to stay under the 300-line ESLint limit on nlResolver.ts.
 * Mirrors the prompt-construction and JSON-parsing patterns from
 * narrationCachePrompt.ts.
 *
 * ADR Decision 4: single Haiku CLI call with bounded candidate list
 * (~30-80 entries for Agent IDE). Returns top-5 ranked JSON with
 * confidence scores and reasons.
 */

import type { EntryPointCandidate } from '../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const NL_RESOLVER_SYSTEM_PROMPT = `You are a code-navigation assistant for the Ouroboros Agent IDE — an Electron desktop IDE that launches and monitors Claude Code sessions. The codebase uses a three-process architecture: main (Node.js), preload (contextBridge), and renderer (React/TypeScript).

You are given a natural-language query describing a user-facing action and a list of candidate entry-point symbols (UI event handlers, IPC handlers, DOM event listeners). Your job is to identify which symbols best match the user's described action.

Key terminology: handleSubmit/handleSend (chat submission handlers), ipcMain.handle (Electron IPC registrations), window.electronAPI (preload bridge), useEffect (React lifecycle), onKeyDown/onClick (DOM event handlers).

Return ONLY a JSON array of up to 5 best-matching candidates, ordered by confidence (highest first):
[{ "symbol": "<qualified name>", "file": "<project-relative path>", "line": <number>, "confidence": <0.0-1.0>, "reason": "<1 sentence why this matches>" }, ...]

Confidence guide:
- 0.9+: The symbol is almost certainly the intended entry point for this action.
- 0.7-0.9: A strong match but there may be ambiguity.
- 0.5-0.7: A plausible match, shown for disambiguation.
- Below 0.5: Do not include.

No markdown fences, no explanation outside the JSON array.`;

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

export interface CandidateInput {
  symbol: string;
  file: string;
  line: number;
  layer: string; // 'renderer' | 'main' | 'preload' — helps Haiku reason about boundaries
}

export function buildNLResolverPrompt(query: string, candidates: CandidateInput[]): string {
  const candidateLines = candidates
    .map(
      (c, i) => `${i + 1}. symbol="${c.symbol}" file="${c.file}" line=${c.line} layer=${c.layer}`,
    )
    .join('\n');
  return [
    NL_RESOLVER_SYSTEM_PROMPT,
    '',
    '---',
    '',
    `Query: "${query}"`,
    '',
    'Candidates:',
    candidateLines,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RawCandidate {
  symbol: string;
  file: string;
  line: number;
  confidence: number;
  reason: string;
}

function stripFences(text: string): string {
  const cleaned = text.trim();
  const fence = cleaned.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/);
  return fence ? fence[1].trim() : cleaned;
}

function parseJsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function extractEmbeddedArray(cleaned: string): unknown[] | null {
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return null;
  return parseJsonArray(match[0]);
}

function extractJsonArray(cleaned: string): unknown[] | null {
  return parseJsonArray(cleaned) ?? extractEmbeddedArray(cleaned);
}

function coerceString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function coerceNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function coerceRawCandidate(item: unknown): RawCandidate | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const symbol = coerceString(obj.symbol, '');
  const file = coerceString(obj.file, '');
  if (!symbol || !file) return null;
  return {
    symbol,
    file,
    line: coerceNumber(obj.line, 0),
    confidence: Math.max(0, Math.min(1, coerceNumber(obj.confidence, 0))),
    reason: coerceString(obj.reason, 'No reason provided'),
  };
}

/**
 * Parse the CLI response text into ranked EntryPointCandidate[].
 * Returns an empty array on malformed input (graceful degradation).
 */
export function parseNLResolverResponse(text: string): EntryPointCandidate[] {
  if (!text || text.trim().length === 0) return [];

  const arr = extractJsonArray(stripFences(text));
  if (!arr) return [];

  const results: EntryPointCandidate[] = [];
  for (const item of arr) {
    const raw = coerceRawCandidate(item);
    if (!raw) continue;
    // Only include candidates with confidence >= 0.5 (per system prompt guidance)
    if (raw.confidence < 0.5) continue;
    results.push({
      symbol: raw.symbol,
      file: raw.file,
      line: raw.line,
      confidence: raw.confidence,
      reason: raw.reason,
    });
    if (results.length >= 5) break; // cap at 5 per ADR Decision 4
  }

  // Sort descending by confidence
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}
