/**
 * flowTracerHandlers.ts — IPC handler registrar for the Flow Tracer subsystem.
 *
 * Standard domain registrar: delegates to the flowTracer barrel in
 * src/main/flowTracer/index.ts and returns the list of registered channel names.
 *
 * Wave 85 Phase 1 — walking skeleton. Two channels registered:
 *   flowTracer:get-canonical-flows
 *   flowTracer:trace-flow
 */

import { cleanupFlowTracerHandlers, registerFlowTracerHandlers } from '../flowTracer/index';

export function registerFlowTracerIpcHandlers(): string[] {
  return registerFlowTracerHandlers();
}

export { cleanupFlowTracerHandlers };
