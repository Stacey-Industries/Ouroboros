/**
 * ipc.ts — Orchestrator that registers all ipcMain handlers by delegating
 * to domain-specific modules in ./ipc-handlers/.
 *
 * Channels mirror the contextBridge API shape in preload.ts.
 * All handlers return serialisable values (no class instances).
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import { startApprovalManagerCleanup, stopApprovalManagerCleanup } from './approvalManager';
import {
  cleanupAgentChatHandlers,
  cleanupCompareProvidersHandlers,
  cleanupConfigWatcher,
  cleanupContextRankerDashboardHandlers,
  cleanupDispatchHandlers,
  cleanupFileWatchers,
  cleanupFlowTracerHandlers,
  cleanupFolderCrudHandlers,
  cleanupLayoutHandlers,
  cleanupMemoryHandlers,
  cleanupPairingHandlers,
  cleanupPinnedContextHandlers,
  cleanupProfileCrudHandlers,
  cleanupResearchControlHandlers,
  cleanupResearchDashboardHandlers,
  cleanupResearchHandlers,
  cleanupSessionCrudHandlers,
  cleanupSystemPromptHandlers,
  cleanupTelemetryHandlers,
  cleanupWorkspaceReadListHandlers,
  cleanupWorktreeHandlers,
  closeEmbeddingStore,
  ensureSchedulerInit,
  lspStopAll,
  registerAgentChatHandlers,
  registerAgentConflictHandlers,
  registerAiHandlers,
  registerAiStreamHandlers,
  registerAppHandlers,
  registerAuthHandlers,
  registerBackgroundJobsHandlers,
  registerCheckpointHandlers,
  registerClaudeMdHandlers,
  registerCompareProvidersHandlers,
  registerConfigHandlers,
  registerContextHandlers,
  registerContextRankerDashboardHandlers,
  registerDispatchHandlers,
  registerEcosystemHandlers,
  registerEmbeddingHandlers,
  registerExtensionStoreHandlers,
  registerFileHandlers,
  registerFlowTracerIpcHandlers,
  registerFolderCrudHandlers,
  registerGitHandlers,
  registerIdeToolsHandlers,
  registerLayoutHandlers,
  registerMarketplaceHandlers,
  registerMcpHandlers,
  registerMcpStoreHandlers,
  registerMemoryHandlers,
  registerMiscHandlers,
  registerPairingHandlers,
  registerPinnedContextHandlers,
  registerProfileCrudHandlers,
  registerProviderHandlers,
  registerPtyHandlers,
  registerPtyPersistenceHandlers,
  registerResearchControlHandlers,
  registerResearchDashboardHandlers,
  registerResearchHandlers,
  registerRouterStatsHandlers,
  registerRulesAndSkillsHandlers,
  registerSearchHandlers,
  registerSessionCrudHandlers,
  registerSessionHandlers,
  registerSpecHandlers,
  registerSubagentHandlers,
  registerSystemPromptHandlers,
  registerTelemetryHandlers,
  registerUsageExporterHandlers,
  registerWorkspaceReadListHandlers,
  registerWorktreeHandlers,
} from './ipc-handlers';
import log from './logger';
import { markStartup } from './perfMetrics';
import { createPtyPersistence } from './ptyPersistence';
import { clearRegistry } from './web/handlerRegistry';

/** Resolve the BrowserWindow that sent an IPC event. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('IPC event from unknown window');
  return win;
}

function safeRegister(name: string, fn: () => string[]): string[] {
  try {
    return fn();
  } catch (err) {
    log.error(`[ipc:register] ${name} FAILED:`, err);
    return [];
  }
}

function registerCoreDomainHandlers(win: BrowserWindow): string[] {
  const ptyStore = createPtyPersistence();
  return [
    ...safeRegister('pty', () => registerPtyHandlers(senderWindow)),
    ...safeRegister('ptyPersistence', () => registerPtyPersistenceHandlers(senderWindow, ptyStore)),
    ...safeRegister('config', () => registerConfigHandlers(senderWindow)),
    ...safeRegister('files', () => registerFileHandlers(senderWindow)),
    ...safeRegister('git', () => registerGitHandlers(senderWindow)),
    ...safeRegister('app', () => registerAppHandlers(senderWindow)),
    ...safeRegister('agentChat', () => registerAgentChatHandlers()),
    ...safeRegister('sessionCrud', () => registerSessionCrudHandlers()),
    ...safeRegister('folderCrud', () => registerFolderCrudHandlers()),
    ...safeRegister('pinnedContext', () => registerPinnedContextHandlers()),
    ...safeRegister('profileCrud', () => registerProfileCrudHandlers()),
    ...safeRegister('research', () => registerResearchHandlers()),
    ...safeRegister('researchControl', () => registerResearchControlHandlers()),
    ...safeRegister('researchDashboard', () => registerResearchDashboardHandlers()),
    ...safeRegister('contextRankerDashboard', () => registerContextRankerDashboardHandlers()),
    ...safeRegister('sessions', () => registerSessionHandlers(senderWindow)),
    ...safeRegister('systemPrompt', () => registerSystemPromptHandlers()),
    ...safeRegister('misc', () => registerMiscHandlers(senderWindow, win)),
    ...safeRegister('mcp', () => registerMcpHandlers(senderWindow)),
    ...safeRegister('mcpStore', () => registerMcpStoreHandlers(senderWindow)),
    ...safeRegister('extensionStore', () => registerExtensionStoreHandlers(senderWindow)),
    ...safeRegister('context', () => registerContextHandlers(senderWindow)),
  ];
}

function registerAuxDomainHandlers(): string[] {
  return [
    ...safeRegister('ideTools', () => registerIdeToolsHandlers(senderWindow)),
    ...safeRegister('claudeMd', () => registerClaudeMdHandlers(senderWindow)),
    ...safeRegister('rulesAndSkills', () => registerRulesAndSkillsHandlers(senderWindow)),
    ...safeRegister('search', () => registerSearchHandlers()),
    ...safeRegister('auth', () => registerAuthHandlers()),
    ...safeRegister('ai', () => registerAiHandlers()),
    ...safeRegister('aiStream', () => registerAiStreamHandlers()),
    ...safeRegister('embedding', () => registerEmbeddingHandlers(senderWindow)),
    ...safeRegister('routerStats', () => registerRouterStatsHandlers()),
    ...safeRegister('spec', () => registerSpecHandlers()),
    ...safeRegister('checkpoint', () => registerCheckpointHandlers()),
    ...safeRegister('backgroundJobs', () => registerBackgroundJobsHandlers()),
    ...safeRegister('agentConflict', () => registerAgentConflictHandlers()),
    ...safeRegister('telemetry', () => registerTelemetryHandlers()),
    ...safeRegister('worktree', () => registerWorktreeHandlers()),
    ...safeRegister('workspaceReadList', () => registerWorkspaceReadListHandlers()),
    ...safeRegister('subagent', () => registerSubagentHandlers()),
    ...safeRegister('layout', () => registerLayoutHandlers()),
    ...safeRegister('mobileAccessPairing', () => registerPairingHandlers()),
    ...safeRegister('sessionDispatch', () => registerDispatchHandlers()),
    ...safeRegister('compareProviders', () => registerCompareProvidersHandlers()),
    ...safeRegister('ecosystem', () => registerEcosystemHandlers()),
    ...safeRegister('usageExporter', () => registerUsageExporterHandlers()),
    ...safeRegister('marketplace', () => registerMarketplaceHandlers()),
    ...safeRegister('memory', () => registerMemoryHandlers()),
    ...safeRegister('flowTracer', () => registerFlowTracerIpcHandlers()),
  ];
}

function registerDomainHandlers(win: BrowserWindow): string[] {
  return [...registerCoreDomainHandlers(win), ...registerAuxDomainHandlers()];
}

async function withCodeModeManager<T>(
  action: (manager: typeof import('./codemode/codemodeManager')) => Promise<T> | T,
): Promise<T | { success: false; error: string }> {
  try {
    const manager = await import('./codemode/codemodeManager');
    return await action(manager);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function registerOrchestrationStubHandlers(channels: string[]): void {
  ipcMain.handle('orchestration:previewContext', async (_event, request: unknown) => {
    try {
      const { buildContextPacket } = await import('./orchestration/contextPacketBuilder');
      const { buildRepoFacts } = await import('./orchestration/repoIndexer');
      const { buildLspDiagnosticsSummary } = await import('./orchestration/lspDiagnosticsProvider');
      const req = request as { workspaceRoots: string[] };
      const repoFacts = await buildRepoFacts(req.workspaceRoots, {
        diagnosticsProvider: buildLspDiagnosticsSummary,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return buildContextPacket({ request: req as any, repoFacts });
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('orchestration:buildContextPacket', async (_event, request: unknown) => {
    try {
      const { buildContextPacket } = await import('./orchestration/contextPacketBuilder');
      const { buildRepoFacts } = await import('./orchestration/repoIndexer');
      const { buildLspDiagnosticsSummary } = await import('./orchestration/lspDiagnosticsProvider');
      const req = request as { workspaceRoots: string[] };
      const repoFacts = await buildRepoFacts(req.workspaceRoots, {
        diagnosticsProvider: buildLspDiagnosticsSummary,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return buildContextPacket({ request: req as any, repoFacts });
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // NOTE: orchestration:cancelTask intentionally removed — see ipc.ts history.
  channels.push('orchestration:previewContext', 'orchestration:buildContextPacket');
}

function registerCodeModeHandlers(channels: string[]): void {
  ipcMain.handle(
    'codemode:enable',
    (_event, args: { serverNames: string[]; scope: 'global' | 'project'; projectRoot?: string }) =>
      withCodeModeManager((manager) =>
        manager.enableCodeMode(args.serverNames, args.scope, args.projectRoot),
      ),
  );
  ipcMain.handle('codemode:disable', () =>
    withCodeModeManager((manager) => manager.disableCodeMode()),
  );
  ipcMain.handle('codemode:status', () =>
    withCodeModeManager((manager) => ({ success: true, ...manager.getCodeModeStatus() })),
  );
  channels.push('codemode:enable', 'codemode:disable', 'codemode:status');
}

let handlersRegistered = false;
let allChannels: string[] = [];

export function registerIpcHandlers(win: BrowserWindow): () => void {
  if (handlersRegistered) {
    return () => {
      /* no-op — handled globally */
    };
  }

  handlersRegistered = true;
  ensureSchedulerInit();
  allChannels = registerDomainHandlers(win);
  registerCodeModeHandlers(allChannels);
  registerProviderHandlers(allChannels);
  registerOrchestrationStubHandlers(allChannels);
  startApprovalManagerCleanup();
  markStartup('ipc-ready');

  return () => {
    void cleanupIpcHandlers();
  };
}

export async function cleanupIpcHandlers(): Promise<void> {
  cleanupFileWatchers();
  cleanupConfigWatcher();
  await cleanupAgentChatHandlers();
  cleanupCompareProvidersHandlers();
  cleanupSessionCrudHandlers();
  cleanupFolderCrudHandlers();
  cleanupPinnedContextHandlers();
  cleanupProfileCrudHandlers();
  cleanupResearchHandlers();
  cleanupResearchControlHandlers();
  cleanupResearchDashboardHandlers();
  cleanupContextRankerDashboardHandlers();
  cleanupTelemetryHandlers();
  cleanupWorktreeHandlers();
  cleanupWorkspaceReadListHandlers();
  cleanupLayoutHandlers();
  cleanupPairingHandlers();
  cleanupDispatchHandlers();
  cleanupSystemPromptHandlers();
  cleanupMemoryHandlers();
  cleanupFlowTracerHandlers();
  closeEmbeddingStore();
  stopApprovalManagerCleanup();
  lspStopAll().catch((error) => {
    log.error('Failed to stop LSP servers during cleanup:', error);
  });
  for (const channel of allChannels) {
    ipcMain.removeHandler(channel);
  }
  clearRegistry();
  allChannels = [];
  handlersRegistered = false;
}
