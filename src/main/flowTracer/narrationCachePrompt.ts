/**
 * narrationCachePrompt.ts — Prompt assembly and response parsing for the
 * per-symbol What+How narration cache.
 *
 * Wave 85 Phase 3. Extracted to stay under the 300-line ESLint limit on
 * narrationCache.ts. Matches the prompt-construction and JSON-parsing
 * patterns from contextLayer/moduleSummarizer.ts verbatim.
 */

import type { Narration, SymbolRef } from '../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WHY_PLACEHOLDER = '[phase 4 — chain-aware Why pending]';

/**
 * System prompt for the Haiku narration call.
 * Includes project-specific terminology to avoid generic LLM boilerplate.
 */
export const NARRATION_SYSTEM_PROMPT = `You are a code documentation assistant for the Ouroboros Agent IDE — an Electron desktop IDE for launching and monitoring Claude Code sessions. The codebase uses a three-process architecture: main (Node.js), preload (contextBridge), and renderer (React/TypeScript).

Key terminology: spawnClaude (CLI subprocess pattern, Max subscription), ipcMain.handle / ipcRenderer.invoke (Electron IPC), contextBridge (preload isolation), FlowTrace/FlowStep/narration (Wave 85 Flow Tracer), orchestration (context-preparation layer), agentChat (chat thread persistence).

For each symbol in the input array, produce a JSON object with:
1. "what": 1-2 sentences — the function's specific role. Use repo-specific terms. Do NOT write vague phrases.
2. "how": 3-5 lines — the mechanism in plain English with key identifiers in backtick spans.

The "why" field is populated by a separate chain-aware call. Return the placeholder string "${WHY_PLACEHOLDER}" for why.

Return ONLY a JSON array: [{ "symbol": "<name>", "what": "...", "why": "${WHY_PLACEHOLDER}", "how": "..." }, ...]. No markdown fences, no explanation.`;

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

export interface NarrationSymbolInput {
  symbolRef: SymbolRef;
  body: string; // first ~60 lines of source
}

export function buildNarrationBatch(symbols: NarrationSymbolInput[]): string {
  const items = symbols.map((s, i) =>
    [
      `--- Symbol ${i + 1}: ${s.symbolRef.symbol} ---`,
      `File: ${s.symbolRef.file}  Line: ${s.symbolRef.line}`,
      '```typescript',
      s.body.slice(0, 2400), // ~600 tokens per symbol
      '```',
    ].join('\n'),
  );
  return `${NARRATION_SYSTEM_PROMPT}\n\n---\n\n${items.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RawNarration {
  symbol: string;
  what: string;
  why: string;
  how: string;
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

function coerceRaw(item: unknown): RawNarration | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const what = coerceString(obj.what, '');
  const how = coerceString(obj.how, '');
  if (!what || !how) return null;
  return {
    symbol: coerceString(obj.symbol, ''),
    what,
    why: coerceString(obj.why, WHY_PLACEHOLDER),
    how,
  };
}

function findMatchBySymbol(
  raw: RawNarration,
  symbols: NarrationSymbolInput[],
): NarrationSymbolInput | undefined {
  if (raw.symbol) return symbols.find((s) => s.symbolRef.symbol === raw.symbol);
  return undefined;
}

function applyPositionalFallback(
  result: Map<string, Narration>,
  arr: unknown[],
  symbols: NarrationSymbolInput[],
): void {
  // Only fire when: no named match found, exactly 1 item in batch, and the
  // response item has an empty symbol field (Haiku omitted the field).
  if (result.size > 0 || arr.length !== 1 || symbols.length !== 1) return;
  const raw = coerceRaw(arr[0]);
  if (raw && raw.symbol === '') {
    result.set(symbols[0].symbolRef.symbol, { what: raw.what, why: raw.why, how: raw.how });
  }
}

/**
 * Parse the CLI response text into per-symbol narrations.
 * Returns a Map keyed by symbol name.
 */
export function parseNarrationBatchResponse(
  text: string,
  symbols: NarrationSymbolInput[],
): Map<string, Narration> {
  const result = new Map<string, Narration>();
  if (!text || text.trim().length === 0) return result;

  const arr = extractJsonArray(stripFences(text));
  if (!arr) return result;

  for (const item of arr) {
    const raw = coerceRaw(item);
    if (!raw) continue;
    const match = findMatchBySymbol(raw, symbols);
    if (!match) continue;
    const key = match.symbolRef.symbol;
    if (!result.has(key)) {
      result.set(key, { what: raw.what, why: raw.why, how: raw.how });
    }
  }

  applyPositionalFallback(result, arr, symbols);
  return result;
}
