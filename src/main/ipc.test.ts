/**
 * ipc.test.ts — smoke tests for the IPC orchestrator.
 *
 * Verifies registerIpcHandlers() and cleanupIpcHandlers() are callable without
 * error. Deep domain-level assertions live in the per-domain test files under
 * ipc-handlers/. This file only tests the orchestration layer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./approvalManager', () => ({
  startApprovalManagerCleanup: vi.fn(),
  stopApprovalManagerCleanup: vi.fn(),
}));

vi.mock('./config', () => ({
  getConfigValue: vi.fn().mockReturnValue({}),
}));

vi.mock('./perfMetrics', () => ({
  markStartup: vi.fn(),
}));

vi.mock('./ptyPersistence', () => ({
  createPtyPersistence: vi.fn().mockReturnValue({}),
}));

vi.mock('./web/handlerRegistry', () => ({
  clearRegistry: vi.fn(),
}));

vi.mock('./ipc-handlers', () => ({
  cleanupAgentChatHandlers: vi.fn().mockResolvedValue(undefined),
  cleanupCompareProvidersHandlers: vi.fn(),
  cleanupConfigWatcher: vi.fn(),
  cleanupContextRankerDashboardHandlers: vi.fn(),
  cleanupDispatchHandlers: vi.fn(),
  cleanupFileWatchers: vi.fn(),
  cleanupFlowTracerHandlers: vi.fn(),
  cleanupFolderCrudHandlers: vi.fn(),
  cleanupLayoutHandlers: vi.fn(),
  cleanupMemoryHandlers: vi.fn(),
  cleanupPairingHandlers: vi.fn(),
  cleanupPinnedContextHandlers: vi.fn(),
  cleanupProfileCrudHandlers: vi.fn(),
  cleanupResearchControlHandlers: vi.fn(),
  cleanupResearchDashboardHandlers: vi.fn(),
  cleanupResearchHandlers: vi.fn(),
  cleanupSessionCrudHandlers: vi.fn(),
  cleanupSystemPromptHandlers: vi.fn(),
  cleanupTelemetryHandlers: vi.fn(),
  cleanupWorkspaceReadListHandlers: vi.fn(),
  cleanupWorktreeHandlers: vi.fn(),
  closeEmbeddingStore: vi.fn(),
  ensureSchedulerInit: vi.fn(),
  lspStopAll: vi.fn().mockResolvedValue(undefined),
  registerAgentChatHandlers: vi.fn().mockReturnValue([]),
  registerAgentConflictHandlers: vi.fn().mockReturnValue([]),
  registerAiHandlers: vi.fn().mockReturnValue([]),
  registerAiStreamHandlers: vi.fn().mockReturnValue([]),
  registerAppHandlers: vi.fn().mockReturnValue([]),
  registerAuthHandlers: vi.fn().mockReturnValue([]),
  registerBackgroundJobsHandlers: vi.fn().mockReturnValue([]),
  registerCheckpointHandlers: vi.fn().mockReturnValue([]),
  registerClaudeMdHandlers: vi.fn().mockReturnValue([]),
  registerCompareProvidersHandlers: vi.fn().mockReturnValue([]),
  registerConfigHandlers: vi.fn().mockReturnValue([]),
  registerContextHandlers: vi.fn().mockReturnValue([]),
  registerContextRankerDashboardHandlers: vi.fn().mockReturnValue([]),
  registerDispatchHandlers: vi.fn().mockReturnValue([]),
  registerEcosystemHandlers: vi.fn().mockReturnValue([]),
  registerEmbeddingHandlers: vi.fn().mockReturnValue([]),
  registerExtensionStoreHandlers: vi.fn().mockReturnValue([]),
  registerFileHandlers: vi.fn().mockReturnValue([]),
  registerFlowTracerIpcHandlers: vi.fn().mockReturnValue([]),
  registerFolderCrudHandlers: vi.fn().mockReturnValue([]),
  registerGitHandlers: vi.fn().mockReturnValue([]),
  registerIdeToolsHandlers: vi.fn().mockReturnValue([]),
  registerLayoutHandlers: vi.fn().mockReturnValue([]),
  registerMarketplaceHandlers: vi.fn().mockReturnValue([]),
  registerMcpHandlers: vi.fn().mockReturnValue([]),
  registerMcpStoreHandlers: vi.fn().mockReturnValue([]),
  registerMemoryHandlers: vi.fn().mockReturnValue([]),
  registerMiscHandlers: vi.fn().mockReturnValue([]),
  registerPairingHandlers: vi.fn().mockReturnValue([]),
  registerPinnedContextHandlers: vi.fn().mockReturnValue([]),
  registerProfileCrudHandlers: vi.fn().mockReturnValue([]),
  registerProviderHandlers: vi.fn(),
  registerPtyHandlers: vi.fn().mockReturnValue([]),
  registerPtyPersistenceHandlers: vi.fn().mockReturnValue([]),
  registerResearchControlHandlers: vi.fn().mockReturnValue([]),
  registerResearchDashboardHandlers: vi.fn().mockReturnValue([]),
  registerResearchHandlers: vi.fn().mockReturnValue([]),
  registerRouterStatsHandlers: vi.fn().mockReturnValue([]),
  registerRulesAndSkillsHandlers: vi.fn().mockReturnValue([]),
  registerSearchHandlers: vi.fn().mockReturnValue([]),
  registerSessionCrudHandlers: vi.fn().mockReturnValue([]),
  registerSessionHandlers: vi.fn().mockReturnValue([]),
  registerSpecHandlers: vi.fn().mockReturnValue([]),
  registerSubagentHandlers: vi.fn().mockReturnValue([]),
  registerSystemPromptHandlers: vi.fn().mockReturnValue([]),
  registerTelemetryHandlers: vi.fn().mockReturnValue([]),
  registerUsageExporterHandlers: vi.fn().mockReturnValue([]),
  registerWorkspaceReadListHandlers: vi.fn().mockReturnValue([]),
  registerWorktreeHandlers: vi.fn().mockReturnValue([]),
}));

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const fakeWin = { webContents: { send: vi.fn() }, id: 1 };
  return {
    BrowserWindow: { fromWebContents: vi.fn().mockReturnValue(fakeWin) },
    ipcMain: {
      handle: (ch: string, fn: (...args: unknown[]) => unknown) => handlers.set(ch, fn),
      removeHandler: (ch: string) => handlers.delete(ch),
      _handlers: handlers,
    },
  };
});

import type { BrowserWindow } from 'electron';

import { cleanupIpcHandlers, registerIpcHandlers } from './ipc';

const mockWin = { webContents: { send: vi.fn() }, id: 1 } as unknown as BrowserWindow;

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    registerIpcHandlers(mockWin);
  });

  afterEach(async () => {
    await cleanupIpcHandlers();
  });

  it('registers without throwing', () => {
    expect(() => registerIpcHandlers(mockWin)).not.toThrow();
  });

  it('is idempotent — double registration does not throw', () => {
    expect(() => registerIpcHandlers(mockWin)).not.toThrow();
  });

  it('returns a cleanup function', () => {
    const cleanup = registerIpcHandlers(mockWin);
    expect(typeof cleanup).toBe('function');
  });
});

describe('cleanupIpcHandlers', () => {
  beforeEach(() => {
    registerIpcHandlers(mockWin);
  });

  it('resolves without throwing', async () => {
    await expect(cleanupIpcHandlers()).resolves.toBeUndefined();
  });

  it('allows re-registration after cleanup', () => {
    expect(() => registerIpcHandlers(mockWin)).not.toThrow();
  });
});
