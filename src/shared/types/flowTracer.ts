/**
 * Flow Tracer — boundary contract types (Wave 85).
 *
 * Cross-process types for the Flow Tracer subsystem. Imported by:
 *   - main process: src/main/flowTracer/**
 *   - renderer process: src/renderer/components/FlowTracer/** + types/electron.d.ts
 *
 * Contract authorship: orchestrator-owned for Wave 85 Phase 1. Implementers may
 * ADD fields in later phases (e.g., narration enrichment, performance metadata)
 * but may not REMOVE or change the meaning of existing fields without ADR
 * amendment.
 *
 * Reference: roadmap/docs/superpowers/specs/2026-05-08-flow-tracer-design.md §5.4.
 */

export type LayerKind = 'user' | 'renderer' | 'preload' | 'main' | 'cli' | 'filesystem';

export type StepKind = 'function' | 'spawn' | 'fs' | 'ipc-bridge' | 'ipc-handler';

export type EdgeKind = 'sync' | 'async' | 'boundary';

export type SymbolRef = {
  symbol: string; // qualified name
  file: string; // project-relative path
  line: number;
};

export type Narration = {
  what: string; // 1-2 sentences — function's role
  why: string; // 1-2 sentences — invariant or constraint that forced it
  how: string; // 3-5 lines — mechanism in plain English
};

export type FlowStep = {
  id: string;
  layer: LayerKind;
  symbol: string; // qualified name
  file: string;
  line: number;
  kind: StepKind;
  narration: Narration | { stale: true } | null;
};

export type FlowEdge = {
  from: string; // FlowStep.id
  to: string; // FlowStep.id
  kind: EdgeKind;
  boundaryChannel?: string; // populated when kind === 'boundary' for IPC crossings
};

export type FlowTraceMetadata = {
  layerCount: number;
  boundaryCount: number;
  depthCapHit: boolean;
};

export type FlowTrace = {
  id: string;
  title: string;
  entryPoint: SymbolRef;
  steps: FlowStep[];
  edges: FlowEdge[];
  generatedAt: number; // epoch ms
  graphVersion: string; // for cache invalidation against codebase-graph state
  metadata: FlowTraceMetadata;
};

export type CanonicalFlow = {
  title: string;
  entryPoint: SymbolRef;
  estimatedSteps: number;
  layers: LayerKind[];
};

// ── Phase 7 additions ────────────────────────────────────────────────────────

/**
 * Lightweight summary returned by listSavedFlows.
 * Does not include the full FlowTrace to keep list payloads small.
 */
export type SavedFlowSummary = {
  id: string;
  title: string;
  savedAt: number; // epoch ms
  layerCount: number;
  source: 'local' | 'shared';
};

// ── Phase 4 additions ────────────────────────────────────────────────────────

/**
 * Per-step Why narration entry produced by the chain-aware Why generator.
 * Cached at <workspaceRoot>/.ouroboros/flows/<flowId>-why.json.
 */
export type FlowWhyEntry = {
  stepId: string; // FlowStep.id
  why: string; // 1-2 sentences naming the invariant the user couldn't have guessed
};

// ── Phase 6 additions ────────────────────────────────────────────────────────

/**
 * A candidate entry point surfaced for natural-language search.
 * Extracted from the codebase graph at index time (~30-80 for Agent IDE).
 * Haiku ranks these given the NL query.
 */
export type EntryPointCandidate = {
  symbol: string; // qualified function/handler name
  file: string; // project-relative path
  line: number;
  confidence: number; // 0.0–1.0 — populated by Haiku ranking, 0 pre-ranking
  reason: string; // Haiku's brief explanation for this ranking
};

/**
 * Result of a natural-language resolution call.
 * confidence = top-1 candidate's confidence (0 if no matches).
 * matches = Haiku-ranked list (up to 5 entries).
 */
export type NLResolveResult = {
  matches: EntryPointCandidate[];
  confidence: number;
};

// IPC response envelopes (Phase 1 — extends in later phases).

export type FlowTracerGetCanonicalFlowsResponse =
  | { success: true; flows: CanonicalFlow[] }
  | { success: false; error: string };

export type FlowTracerTraceFlowResponse =
  | { success: true; flow: FlowTrace }
  | { success: false; error: string };

// ── Phase 6 IPC response envelopes ──────────────────────────────────────────

export type FlowTracerResolveNaturalLanguageResponse =
  | { success: true; result: NLResolveResult }
  | { success: false; error: string };
