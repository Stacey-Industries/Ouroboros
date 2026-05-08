/**
 * src/main/flowTracer/index.ts — Flow Tracer subsystem barrel + IPC handler registrar.
 *
 * Wave 85 Phase 1 (walking skeleton): hardcoded one canonical flow ("send a chat message")
 * with stubbed FlowTrace + placeholder narration. No real Tree-sitter scanning yet, no
 * real narration generation, no NL search. Phases 2-7 generalize each layer.
 *
 * Phase 1 stub state: this file currently exports the registrar shape only — no channels
 * are bound. The orchestrator-owned acceptance test at
 * `src/main/flowTracer/walkingSkeleton.acceptance.test.ts` asserts the boundary contract
 * the implementer must deliver. The Phase 1 implementer fills this in.
 */

export function registerFlowTracerHandlers(): string[] {
  // Phase 1 implementer: bind `flowTracer:get-canonical-flows` and
  // `flowTracer:trace-flow` here, returning the shapes asserted by
  // walkingSkeleton.acceptance.test.ts. See the design spec §5.4 for FlowTrace.
  return [];
}

export function cleanupFlowTracerHandlers(): void {
  // Phase 1 implementer: removeHandler for each channel registered above.
}
