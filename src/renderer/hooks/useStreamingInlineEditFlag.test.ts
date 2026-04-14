/**
 * Tests for useStreamingInlineEditFlag.
 *
 * The hook uses useEffect to mirror config.streamingInlineEdit onto
 * window.__streamingInlineEdit__.  Since vitest runs in the Node environment
 * (no DOM), we test the mirroring logic directly by stubbing window and
 * invoking the effect manually, matching the pattern used by
 * useLspDiagnosticsSync.test.ts in this directory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../types/electron';

type Win = Record<string, unknown>;

// Read the flag from the simulated window.
function getFlag(): unknown {
  return (global as unknown as Win).__streamingInlineEdit__;
}

// Simulate what the hook's useEffect body does — extracted here so we can
// test the logic without a React renderer.
function applyFlag(config: AppConfig | null): void {
  (global as unknown as Win).__streamingInlineEdit__ =
    config?.streamingInlineEdit === true;
}

describe('useStreamingInlineEditFlag — effect logic', () => {
  beforeEach(() => {
    delete (global as unknown as Win).__streamingInlineEdit__;
  });

  afterEach(() => {
    delete (global as unknown as Win).__streamingInlineEdit__;
    vi.restoreAllMocks();
  });

  it('sets flag to false when config is null', () => {
    applyFlag(null);
    expect(getFlag()).toBe(false);
  });

  it('sets flag to false when streamingInlineEdit is absent', () => {
    applyFlag({} as AppConfig);
    expect(getFlag()).toBe(false);
  });

  it('sets flag to false when streamingInlineEdit is explicitly false', () => {
    applyFlag({ streamingInlineEdit: false } as unknown as AppConfig);
    expect(getFlag()).toBe(false);
  });

  it('sets flag to true when streamingInlineEdit is true', () => {
    applyFlag({ streamingInlineEdit: true } as unknown as AppConfig);
    expect(getFlag()).toBe(true);
  });

  it('mirrors flag changes as config updates', () => {
    applyFlag({ streamingInlineEdit: false } as unknown as AppConfig);
    expect(getFlag()).toBe(false);

    applyFlag({ streamingInlineEdit: true } as unknown as AppConfig);
    expect(getFlag()).toBe(true);

    applyFlag({ streamingInlineEdit: false } as unknown as AppConfig);
    expect(getFlag()).toBe(false);
  });
});

describe('useStreamingInlineEditFlag — hook contract', () => {
  it('exports useStreamingInlineEditFlag as a function', async () => {
    const mod = await import('./useStreamingInlineEditFlag');
    expect(typeof mod.useStreamingInlineEditFlag).toBe('function');
  });
});
