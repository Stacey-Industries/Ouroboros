/**
 * mainShutdown.test.ts — Smoke tests for performWillQuitShutdown.
 *
 * Verifies the ordering invariants that matter for clean Electron exit:
 *   - async writers are awaited before sync stores close
 *   - codebase-graph disposal runs and errors are swallowed (tryShutdown)
 *   - a failing subsystem does not abort the shutdown sequence
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

const calls: string[] = [];

function recorder(name: string, async = false): (() => unknown) {
  if (async) return vi.fn(async () => { calls.push(name); });
  return vi.fn(() => { calls.push(name); });
}

vi.mock('./agentChat/threadStore', () => ({ closeThreadStore: recorder('closeThreadStore') }));
vi.mock('./claudeUsagePoller', () => ({ stopClaudeUsagePoller: recorder('stopClaudeUsagePoller', true) }));
vi.mock('./costHistory', () => ({ closeCostHistoryDb: recorder('closeCostHistoryDb') }));
vi.mock('./extensionHost/extensionHostProxy', () => ({
  shutdownExtensionHost: recorder('shutdownExtensionHost', true),
}));
vi.mock('./ipc', () => ({ cleanupIpcHandlers: recorder('cleanupIpcHandlers', true) }));
vi.mock('./logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('./mainStartup', () => ({
  closeEditProvenance: recorder('closeEditProvenance'),
  disposeCodebaseGraph: recorder('disposeCodebaseGraph', true),
}));
// Wave 60 Phase E: mcpHost subsystem removed alongside internalMcpServer.
vi.mock('./orchestration/contextDecisionWriter', () => ({
  closeDecisionWriter: recorder('closeDecisionWriter', true),
}));
vi.mock('./orchestration/contextOutcomeWriter', () => ({
  closeOutcomeWriter: recorder('closeOutcomeWriter', true),
}));
vi.mock('./orchestration/providers/codexAppServerProcess', () => ({
  shutdownCodexAppServerProcesses: recorder('shutdownCodexAppServerProcesses', true),
}));
vi.mock('./pipeAuth', () => ({ deleteTokenFile: recorder('deleteTokenFile') }));
vi.mock('./research/correctionWriter', () => ({
  closeCorrectionWriter: recorder('closeCorrectionWriter', true),
}));
vi.mock('./research/researchOutcomeWriter', () => ({
  closeResearchOutcomeWriter: recorder('closeResearchOutcomeWriter', true),
}));
vi.mock('./router/qualitySignalCollector', () => ({ clearQualityTimers: recorder('clearQualityTimers') }));
vi.mock('./router/retrainTrigger', () => ({ stopObserving: recorder('stopRetrainObserver') }));
vi.mock('./session/sessionStartup', () => ({ closeSessionServices: recorder('closeSessionServices') }));
vi.mock('./telemetry', () => ({
  closeOutcomeObserver: recorder('closeOutcomeObserver'),
  closeTelemetryStore: recorder('closeTelemetryStore'),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('performWillQuitShutdown', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });

  it('runs through the full shutdown sequence in dependency order', async () => {
    const { performWillQuitShutdown } = await import('./mainShutdown');
    await performWillQuitShutdown();

    expect(calls).toContain('closeSessionServices');
    expect(calls).toContain('closeDecisionWriter');
    expect(calls).toContain('closeTelemetryStore');
    expect(calls).toContain('stopClaudeUsagePoller');
    expect(calls).toContain('cleanupIpcHandlers');
    expect(calls).toContain('closeThreadStore');
    expect(calls).toContain('disposeCodebaseGraph');
    expect(calls).toContain('shutdownCodexAppServerProcesses');
    expect(calls).toContain('shutdownExtensionHost');

    // Writers run before the sync stores close (telemetry depends on writers being flushed).
    expect(calls.indexOf('closeDecisionWriter')).toBeLessThan(calls.indexOf('closeTelemetryStore'));
    // IPC cleanup runs before codebase-graph disposal (handlers may hold references).
    expect(calls.indexOf('cleanupIpcHandlers')).toBeLessThan(calls.indexOf('disposeCodebaseGraph'));
  });

  it('swallows subsystem errors via tryShutdown so later steps still run', async () => {
    const startup = await import('./mainStartup');
    (startup.disposeCodebaseGraph as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      calls.push('disposeCodebaseGraph');
      throw new Error('graph dispose failed');
    });

    const { performWillQuitShutdown } = await import('./mainShutdown');
    await expect(performWillQuitShutdown()).resolves.toBeUndefined();

    // Later subsystems still ran after the graph threw.
    expect(calls.indexOf('disposeCodebaseGraph')).toBeLessThan(calls.indexOf('shutdownExtensionHost'));
  });
});
