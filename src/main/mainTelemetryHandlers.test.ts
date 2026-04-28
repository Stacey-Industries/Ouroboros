/**
 * mainTelemetryHandlers.test.ts — smoke tests for the aggregated registrar.
 *
 * Verifies all four per-surface registrars are invoked exactly once when
 * registerAllTelemetryDrainHandlers() runs.
 */

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerSpawnCostHandler: vi.fn(),
  registerHookEventsHandler: vi.fn(),
  registerSpawnTraceHandler: vi.fn(),
  registerRouterShadowHandler: vi.fn(),
}));

vi.mock('./orchestration/providers/spawnCostDrainHandler', () => ({
  registerSpawnCostHandler: mocks.registerSpawnCostHandler,
}));
vi.mock('./router/routerShadowDrainHandler', () => ({
  registerRouterShadowHandler: mocks.registerRouterShadowHandler,
}));
vi.mock('./telemetry/hookEventsDrainHandler', () => ({
  registerHookEventsHandler: mocks.registerHookEventsHandler,
}));
vi.mock('./telemetry/spawnTraceDrainHandler', () => ({
  registerSpawnTraceHandler: mocks.registerSpawnTraceHandler,
}));

describe('registerAllTelemetryDrainHandlers', () => {
  it('invokes all four per-surface registrars exactly once', async () => {
    const { registerAllTelemetryDrainHandlers } = await import('./mainTelemetryHandlers');
    registerAllTelemetryDrainHandlers();
    expect(mocks.registerSpawnCostHandler).toHaveBeenCalledTimes(1);
    expect(mocks.registerHookEventsHandler).toHaveBeenCalledTimes(1);
    expect(mocks.registerSpawnTraceHandler).toHaveBeenCalledTimes(1);
    expect(mocks.registerRouterShadowHandler).toHaveBeenCalledTimes(1);
  });
});
