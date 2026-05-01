/**
 * mainStartupContextLayerTrigger.test.ts — Smoke tests for the post-graph-ready
 * contextLayer rebuild trigger.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./contextLayer/contextLayerController', () => ({
  getContextLayerController: vi.fn(),
}));

vi.mock('./logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getContextLayerController } from './contextLayer/contextLayerController';
import { triggerContextLayerRebuildAfterGraphReady } from './mainStartupContextLayerTrigger';

const mockedGetController = vi.mocked(getContextLayerController);

describe('triggerContextLayerRebuildAfterGraphReady', () => {
  beforeEach(() => {
    mockedGetController.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when no controller is registered', async () => {
    mockedGetController.mockReturnValue(null);
    await expect(triggerContextLayerRebuildAfterGraphReady()).resolves.toBeUndefined();
  });

  it('calls forceRebuild on the registered controller', async () => {
    const forceRebuild = vi.fn().mockResolvedValue(undefined);
    mockedGetController.mockReturnValue({ forceRebuild } as never);

    await triggerContextLayerRebuildAfterGraphReady();
    expect(forceRebuild).toHaveBeenCalledOnce();
  });

  it('swallows forceRebuild failures so callers (mainStartup) never throw', async () => {
    const forceRebuild = vi.fn().mockRejectedValue(new Error('boom'));
    mockedGetController.mockReturnValue({ forceRebuild } as never);

    await expect(triggerContextLayerRebuildAfterGraphReady()).resolves.toBeUndefined();
  });
});
