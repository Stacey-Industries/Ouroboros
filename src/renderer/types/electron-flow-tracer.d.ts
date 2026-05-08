/**
 * electron-flow-tracer.d.ts — IPC types for the Flow Tracer subsystem.
 *
 * Re-exports canonical cross-process types from src/shared/types/flowTracer.ts
 * and declares the FlowTracerAPI surface exposed via window.electronAPI.flowTracer.
 *
 * Wave 85 Phase 1 — walking skeleton.
 */

export type {
  CanonicalFlow,
  EdgeKind,
  FlowEdge,
  FlowStep,
  FlowTrace,
  FlowTraceMetadata,
  FlowTracerGetCanonicalFlowsResponse,
  FlowTracerTraceFlowResponse,
  LayerKind,
  Narration,
  SavedFlowSummary,
  StepKind,
  SymbolRef,
} from '../../shared/types/flowTracer';

import type {
  CanonicalFlow,
  FlowTrace,
  FlowTracerGetCanonicalFlowsResponse,
  FlowTracerTraceFlowResponse,
  Narration,
  SavedFlowSummary,
  SymbolRef,
} from '../../shared/types/flowTracer';

// ── Phase 3 IPC response envelopes ───────────────────────────────────────────

export type FlowTracerGetNarrationResponse =
  | { success: true; narration: Narration | { stale: true } | null }
  | { success: false; error: string };

// ── Phase 7 IPC response envelopes ───────────────────────────────────────────

export type FlowTracerSaveFlowResponse =
  | { success: true; id: string }
  | { success: false; error: string };

export type FlowTracerListSavedFlowsResponse =
  | { success: true; flows: SavedFlowSummary[] }
  | { success: false; error: string };

export type FlowTracerLoadFlowResponse =
  | { success: true; flow: FlowTrace }
  | { success: false; error: string };

export type FlowTracerExportMermaidResponse =
  | { success: true; mermaid: string }
  | { success: false; error: string };

export interface FlowTracerAPI {
  /** Returns the hardcoded list of canonical flows available to trace. */
  getCanonicalFlows: () => Promise<FlowTracerGetCanonicalFlowsResponse>;
  /** Traces the flow starting at the given entry point symbol. */
  traceFlow: (entryPoint: SymbolRef) => Promise<FlowTracerTraceFlowResponse>;
  /** Convenience: returns the CanonicalFlow list directly (throws on error). */
  listFlows: () => Promise<CanonicalFlow[]>;
  /** Convenience: returns the FlowTrace directly (throws on error). */
  runTrace: (entryPoint: SymbolRef) => Promise<FlowTrace>;
  // ── Phase 3: per-symbol narration cache ───────────────────────────────────
  /** Get cached What+How narration for a symbol; null = cache miss (background generation queued). */
  getNarration: (symbolRef: SymbolRef) => Promise<FlowTracerGetNarrationResponse>;
  // ── Phase 7: persistence + Mermaid export ──────────────────────────────────
  /** Save a FlowTrace to disk; returns the assigned flow id. */
  saveFlow: (flow: FlowTrace, title: string) => Promise<FlowTracerSaveFlowResponse>;
  /** List saved flows (lightweight summaries, both local and shared). */
  listSavedFlows: () => Promise<FlowTracerListSavedFlowsResponse>;
  /** Load a saved FlowTrace by id. */
  loadFlow: (id: string) => Promise<FlowTracerLoadFlowResponse>;
  /** Convert a FlowTrace to Mermaid sequenceDiagram text (renderer writes to clipboard). */
  exportMermaid: (flow: FlowTrace) => Promise<FlowTracerExportMermaidResponse>;
}
