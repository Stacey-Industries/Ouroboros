/**
 * mainTelemetryHandlers.ts — Wave 53a Phase C
 *
 * Aggregates the per-surface telemetry parity drain handler registrations
 * called once from `main.ts` during `initTelemetryAndWriters`. Lives in its
 * own module so adding new surfaces does not push `main.ts` over the
 * 300-line ceiling.
 */

import { registerSpawnCostHandler } from './orchestration/providers/spawnCostDrainHandler';
import { registerRouterShadowHandler } from './router/routerShadowDrainHandler';
import { registerHookEventsHandler } from './telemetry/hookEventsDrainHandler';
import { registerSpawnTraceHandler } from './telemetry/spawnTraceDrainHandler';

/**
 * Register all per-surface drain handlers. Call once at IDE boot before
 * `runParityQueueDrain()` fires so the handlers are in place when queued
 * records are dispatched.
 */
export function registerAllTelemetryDrainHandlers(): void {
  registerSpawnCostHandler();
  registerHookEventsHandler();
  registerSpawnTraceHandler();
  registerRouterShadowHandler();
}
