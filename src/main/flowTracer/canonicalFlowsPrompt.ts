/**
 * canonicalFlowsPrompt.ts — Prompt assembly and response parsing for the
 * canonical flow gallery generator.
 *
 * Wave 85 Phase 5. Extracted to stay under the 300-line ESLint limit on
 * canonicalFlows.ts. Matches the narrationCachePrompt.ts / moduleSummarizer.ts
 * prompt-construction and JSON-parsing patterns.
 */

import type { CanonicalFlow, LayerKind, SymbolRef } from '../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Layer values that the LLM is allowed to emit. */
const VALID_LAYERS: ReadonlySet<string> = new Set<LayerKind>([
  'user',
  'renderer',
  'preload',
  'main',
  'cli',
  'filesystem',
]);

const MIN_FLOWS = 8;
const MAX_FLOWS = 15;
const MAX_CANDIDATES = 80;

/** System / user context included with every gallery-generation call. */
const PROJECT_CONTEXT = `You are a code documentation assistant for the Ouroboros Agent IDE — an Electron desktop IDE for launching and monitoring Claude Code sessions. The codebase uses a three-process architecture: main (Node.js), preload (contextBridge), and renderer (React/TypeScript).

Key terminology: spawnClaude (CLI subprocess, Max subscription), ipcMain.handle / ipcRenderer.invoke (Electron IPC), contextBridge (preload isolation), FlowTrace/FlowStep (Wave 85 Flow Tracer), orchestration (context-preparation layer), agentChat (chat thread persistence), PTY (node-pty terminal sessions).`;

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

/** A candidate entry-point symbol extracted from the graph at index time. */
export interface EntryPointCandidate {
  symbol: string;
  file: string; // project-relative path
  line: number;
  category: 'renderer-event' | 'ipc-handler'; // where it was found
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildCandidateList(candidates: EntryPointCandidate[]): string {
  const capped = candidates.slice(0, MAX_CANDIDATES);
  return capped
    .map((c, i) => `${i + 1}. ${c.symbol} (${c.category}) — ${c.file}:${c.line}`)
    .join('\n');
}

/**
 * Assemble the gallery-generation prompt.
 *
 * Asks Haiku for 8-15 pedagogically-valuable flow titles + entry-point symbols
 * from the bounded candidate list, with `layers` arrays describing which layers
 * each flow traverses.
 */
export function buildGalleryPrompt(
  candidates: EntryPointCandidate[],
  claudeMdExcerpt: string,
): string {
  const candidateList = buildCandidateList(candidates);
  const schemaExample = JSON.stringify(
    {
      title: 'When I send a chat message',
      entryPoint: {
        symbol: 'handleChatSend',
        file: 'src/renderer/components/Chat/Chat.tsx',
        line: 42,
      },
      estimatedSteps: 6,
      layers: ['renderer', 'preload', 'main', 'cli'],
    },
    null,
    2,
  );

  return `${PROJECT_CONTEXT}

## Project CLAUDE.md excerpt
${claudeMdExcerpt.slice(0, 1200)}

## Entry-point candidates (${candidates.length} total)

${candidateList}

## Your task

Select ${MIN_FLOWS}–${MAX_FLOWS} of the most pedagogically valuable user-facing flows from the candidate list above. Choose flows that:
- Start from a user action (click, submit, keyboard shortcut, etc.)
- Span multiple layers (renderer → preload → main → CLI or filesystem)
- Teach something non-obvious about how the IDE works

For each selected flow, return a JSON object with exactly these fields:
- "title": string — user-friendly "When I…" or "How the IDE…" description
- "entryPoint": { "symbol": string, "file": string, "line": number } — must match a candidate exactly
- "estimatedSteps": number — expected number of trace hops (3–12)
- "layers": string[] — which layers this flow crosses (valid values: "user" "renderer" "preload" "main" "cli" "filesystem")

Example entry:
${schemaExample}

Return ONLY a JSON array of ${MIN_FLOWS}–${MAX_FLOWS} objects with exactly those fields. No markdown fences, no explanation.`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

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

function normalizeLayers(raw: unknown): LayerKind[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is LayerKind => typeof v === 'string' && VALID_LAYERS.has(v));
}

function extractTitle(obj: Record<string, unknown>): string | null {
  return typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : null;
}

function coerceNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function extractEntryPoint(obj: Record<string, unknown>): SymbolRef | null {
  const ep = obj.entryPoint;
  if (!ep || typeof ep !== 'object') return null;
  const epObj = ep as Record<string, unknown>;
  const symbol = coerceNonEmptyString(epObj.symbol);
  const file = coerceNonEmptyString(epObj.file);
  const line = typeof epObj.line === 'number' ? epObj.line : null;
  if (!symbol || !file || line === null) return null;
  return { symbol, file, line };
}

/** Validate and coerce a raw item into a CanonicalFlow or null. */
function coerceFlow(item: unknown): CanonicalFlow | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const title = extractTitle(obj);
  if (!title) return null;

  const entryPoint = extractEntryPoint(obj);
  if (!entryPoint) return null;

  const estimatedSteps = typeof obj.estimatedSteps === 'number' ? obj.estimatedSteps : 5;
  const layers = normalizeLayers(obj.layers);

  return { title, entryPoint, estimatedSteps, layers };
}

/**
 * Parse the gallery-generation CLI response into validated CanonicalFlow[].
 * Drops entries that fail validation (bad shape, invalid layers, etc.).
 */
export function parseGalleryResponse(
  text: string,
  candidates: EntryPointCandidate[],
  resolveEntryPoints: boolean,
): CanonicalFlow[] {
  if (!text || text.trim().length === 0) return [];

  const arr = extractJsonArray(stripFences(text));
  if (!arr) return [];

  const candidateKeys = new Set(candidates.map((c) => c.symbol));
  const results: CanonicalFlow[] = [];

  for (const item of arr) {
    const flow = coerceFlow(item);
    if (!flow) continue;
    // Drop flows whose entry point doesn't match any known candidate
    if (resolveEntryPoints && !candidateKeys.has(flow.entryPoint.symbol)) continue;
    results.push(flow);
  }

  return results;
}
