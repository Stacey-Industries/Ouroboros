/**
 * flowWhyPrompt.ts — Prompt assembly and response parsing for the
 * per-flow chain-aware Why narration (Wave 85 Phase 4).
 *
 * Separated from flowWhyCache.ts to stay under the 300-line ESLint limit.
 *
 * Design rationale (Decision 5, wave-85-decisions.md):
 *   Why is flow-extrinsic — the same symbol's "why does this exist" reads
 *   differently depending on the flow it sits in.  One whole-flow CLI call
 *   with the ordered chain + cached What+How gives Haiku the causal context
 *   needed to write invariant-naming Why text rather than generic boilerplate.
 *
 * Pedagogical quality bar (design spec §5.2):
 *   Why names the invariant the user COULD NOT have guessed from reading the
 *   function signature alone.  NOT "this function handles submission" — that
 *   is What.  Target: "The renderer can't talk directly to the Claude CLI —
 *   Electron's security model isolates it.  handleSubmit is the boundary."
 */

import type { FlowTrace, FlowWhyEntry, Narration } from '../../shared/types/flowTracer';
import { WHY_PLACEHOLDER } from './narrationCachePrompt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max lines of symbol body included in the flow-Why prompt.
 * Caps the prompt at a predictable byte budget (wave plan risk row). */
export const STEP_BODY_MAX_LINES = 30;

const SYSTEM_CONTEXT = `You are a code documentation assistant for the Ouroboros Agent IDE — an Electron desktop IDE for launching and monitoring Claude Code sessions. The codebase uses a three-process architecture: main (Node.js), preload (contextBridge), renderer (React/TypeScript).

Key terminology: spawnClaude (CLI subprocess, Max subscription — no direct API calls), ipcMain.handle / ipcRenderer.invoke (Electron IPC), contextBridge (preload isolation enforced by Electron security model), FlowTrace/FlowStep/narration (Wave 85 Flow Tracer), orchestration (context-preparation layer), agentChat (chat thread persistence).

Your task: for each step in the ordered causal chain below, write 1-2 sentences that name the INVARIANT or CONSTRAINT that forced this step to exist in this flow.

Pedagogical bar: the Why field is the most valuable of the three narration fields. It names what the user COULD NOT have guessed from reading the function name alone — the external pressure, architectural constraint, or system-level rule that makes this step necessary in THIS flow.

Good Why: "The renderer can't talk directly to the Claude CLI — Electron's security model isolates it. handleSubmit is the bridge that enforces this boundary."
Bad Why (restatement of What): "This function handles form submission and sends the message."

Return ONLY a JSON array, no markdown fences, no explanation:
[{ "stepId": "<id>", "why": "<1-2 sentences>" }, ...]`;

// ---------------------------------------------------------------------------
// Step-body truncation
// ---------------------------------------------------------------------------

/**
 * Truncate a symbol body to at most STEP_BODY_MAX_LINES lines, always
 * preserving the first line (which contains the function signature).
 * Appended "…" suffix makes truncation visible in prompt.
 */
export function truncateStepBody(body: string): string {
  const lines = body.split('\n');
  if (lines.length <= STEP_BODY_MAX_LINES) return body;
  const head = lines.slice(0, STEP_BODY_MAX_LINES);
  return head.join('\n') + '\n// … (truncated)';
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

export interface StepWithNarration {
  stepId: string;
  symbol: string;
  file: string;
  line: number;
  body: string;
  narration: Pick<Narration, 'what' | 'how'> | null;
}

/**
 * Build the chain-aware Why prompt from a FlowTrace plus cached What+How
 * narrations looked up per symbol.
 *
 * @param flow           The full FlowTrace (used for id, title, steps).
 * @param perSymbolNarration  Map from symbol-qualified-name to {what, how}.
 *                           Populated by Phase 3's narrationCache.getNarration.
 * @param stepBodies     Map from FlowStep.id to raw source body string.
 */
export function buildFlowWhyPrompt(
  flow: FlowTrace,
  perSymbolNarration: Map<string, Pick<Narration, 'what' | 'how'>>,
  stepBodies: Map<string, string>,
): string {
  const chainLines: string[] = [
    `Flow: "${flow.title}"`,
    `Steps (in causal order, ${flow.steps.length} total):`,
    '',
  ];

  for (const [idx, step] of flow.steps.entries()) {
    const narration = perSymbolNarration.get(step.symbol);
    const rawBody = stepBodies.get(step.id) ?? '';
    const truncatedBody = truncateStepBody(rawBody);

    chainLines.push(`## Step ${idx + 1} — id: ${step.id}`);
    chainLines.push(`Symbol: ${step.symbol}`);
    chainLines.push(`File: ${step.file}  Line: ${step.line}  Layer: ${step.layer}`);

    if (narration) {
      chainLines.push(`What: ${narration.what}`);
      chainLines.push(`How: ${narration.how}`);
    } else {
      chainLines.push('What: (not yet cached)');
      chainLines.push('How: (not yet cached)');
    }

    if (truncatedBody.length > 0) {
      chainLines.push('```typescript');
      chainLines.push(truncatedBody);
      chainLines.push('```');
    }
    chainLines.push('');
  }

  chainLines.push('---');
  chainLines.push(
    'For each step, write 1-2 sentences naming the invariant or constraint that forced this step to exist in THIS flow. Reference the causal context.',
  );
  chainLines.push('Return JSON: [{ "stepId": "<id>", "why": "..." }, ...]');

  return `${SYSTEM_CONTEXT}\n\n---\n\n${chainLines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RawWhyEntry {
  stepId: string;
  why: string;
}

function stripFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/);
  return fence ? fence[1].trim() : t;
}

function parseJsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractEmbeddedArray(text: string): unknown[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  return match ? parseJsonArray(match[0]) : null;
}

function coerceWhyEntry(item: unknown): RawWhyEntry | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const stepId = typeof obj.stepId === 'string' ? obj.stepId.trim() : '';
  const why = typeof obj.why === 'string' ? obj.why.trim() : '';
  if (!stepId || !why) return null;
  return { stepId, why };
}

/**
 * Parse the CLI response text into FlowWhyEntry[].
 * Degrades gracefully when Haiku adds prose around the JSON.
 * Validates that every stepId references an actual step in the flow.
 *
 * Entries whose stepId doesn't match any step are dropped (they are
 * hallucinated references, not valid references).
 */
export function parseFlowWhyResponse(stdout: string, flow: FlowTrace): FlowWhyEntry[] {
  if (!stdout || stdout.trim().length === 0) return [];

  const cleaned = stripFences(stdout);
  const arr = parseJsonArray(cleaned) ?? extractEmbeddedArray(cleaned);
  if (!arr) return [];

  const validStepIds = new Set(flow.steps.map((s) => s.id));
  const result: FlowWhyEntry[] = [];
  const seen = new Set<string>();

  for (const item of arr) {
    const raw = coerceWhyEntry(item);
    if (!raw) continue;
    if (!validStepIds.has(raw.stepId)) continue; // drop hallucinated stepId
    if (seen.has(raw.stepId)) continue; // deduplicate
    seen.add(raw.stepId);
    result.push({ stepId: raw.stepId, why: raw.why });
  }

  return result;
}

/**
 * Fill in WHY_PLACEHOLDER for any steps not covered by Haiku's response.
 * Ensures every step always has a Why entry in the returned array.
 */
export function fillMissingWhyEntries(entries: FlowWhyEntry[], flow: FlowTrace): FlowWhyEntry[] {
  const covered = new Set(entries.map((e) => e.stepId));
  const filled = [...entries];
  for (const step of flow.steps) {
    if (!covered.has(step.id)) {
      filled.push({ stepId: step.id, why: WHY_PLACEHOLDER });
    }
  }
  return filled;
}
