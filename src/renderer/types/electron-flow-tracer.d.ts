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
  StepKind,
  SymbolRef,
} from '../../shared/types/flowTracer';

import type {
  CanonicalFlow,
  FlowTrace,
  FlowTracerGetCanonicalFlowsResponse,
  FlowTracerTraceFlowResponse,
  SymbolRef,
} from '../../shared/types/flowTracer';

export interface FlowTracerAPI {
  /** Returns the hardcoded list of canonical flows available to trace. */
  getCanonicalFlows: () => Promise<FlowTracerGetCanonicalFlowsResponse>;
  /** Traces the flow starting at the given entry point symbol. */
  traceFlow: (entryPoint: SymbolRef) => Promise<FlowTracerTraceFlowResponse>;
  /** Convenience: returns the CanonicalFlow list directly (throws on error). */
  listFlows: () => Promise<CanonicalFlow[]>;
  /** Convenience: returns the FlowTrace directly (throws on error). */
  runTrace: (entryPoint: SymbolRef) => Promise<FlowTrace>;
}
