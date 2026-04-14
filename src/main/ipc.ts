/**
 * ipc.ts â€” Orchestrator that registers all ipcMain handlers by delegating
 * to domain-specific modules in ./ipc-handlers/.
 *
 * Channels mirror the contextBridge API shape in preload.ts.
 * All handlers return serialisable values (no class instances).
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import { startApprovalManagerCleanup, stopApprovalManagerCleanup } from './approvalManager';
import { hasSecureKey } from './auth/secureKeyStore';
import { listCodexModels } from './codex';
import { getConfigValue } from './config';
import {
  cleanupAgentChatHandlers,
  cleanupConfigWatcher,
  cleanupFileWatchers,
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
  registerConfigHandlers,
  registerContextHandlers,
  registerEmbeddingHandlers,
  registerExtensionStoreHandlers,
  registerFileHandlers,
  registerGitHandlers,
  registerIdeToolsHandlers,
  registerMcpHandlers,
  registerMcpStoreHandlers,
  registerMiscHandlers,
  registerPtyHandlers,
  registerPtyPersistenceHandlers,
  registerRouterStatsHandlers,
  registerRulesAndSkillsHandlers,
  registerSearchHandlers,
  registerSessionHandlers,
  registerSpecHandlers,
} from './ipc-handlers';
import log from './logger';
import { getAllProviders } from './providers';
import type { CodexThreadCaptureArgs } from './ptyCodexCapture';
import { resolveCodexThreadId } from './ptyCodexCapture';
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

function registerDomainHandlers(win: BrowserWindow): string[] {
  const ptyStore = createPtyPersistence();
  return [
    ...safeRegister('pty', () => registerPtyHandlers(senderWindow)),
    ...safeRegister('ptyPersistence', () => registerPtyPersistenceHandlers(senderWindow, ptyStore)),
    ...safeRegister('config', () => registerConfigHandlers(senderWindow)),
    ...safeRegister('files', () => registerFileHandlers(senderWindow)),
    ...safeRegister('git', () => registerGitHandlers(senderWindow)),
    ...safeRegister('app', () => registerAppHandlers(senderWindow)),
    ...safeRegister('agentChat', () => registerAgentChatHandlers()),
    ...safeRegister('sessions', () => registerSessionHandlers(senderWindow)),
    ...safeRegister('misc', () => registerMiscHandlers(senderWindow, win)),
    ...safeRegister('mcp', () => registerMcpHandlers(senderWindow)),
    ...safeRegister('mcpStore', () => registerMcpStoreHandlers(senderWindow)),
    ...safeRegister('extensionStore', () => registerExtensionStoreHandlers(senderWindow)),
    ...safeRegister('context', () => registerContextHandlers(senderWindow)),
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
  ];
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

/**
 * Minimal orchestration IPC stubs — only the 3 methods still used:
 * - previewContext / buildContextPacket: used by context builder
 * - cancelTask: used by chat to abort a running Claude Code process
 *
 * The full orchestration task system (AgentLoopController, Anthropic API adapter,
 * tool executor, subagent runner, session store) was removed as dead code.
 */
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

  // NOTE: orchestration:cancelTask has been intentionally removed.
  // It created a fresh ClaudeCodeAdapter instance on every call (empty process Maps),
  // so it could never find or kill the running process. Cancel is handled via
  // agentChat:cancelTask, which routes through the singleton orchestration that
  // actually owns the running processes. The preload still exposes
  // orchestration.cancelTask() for renderer compatibility — it now routes to
  // agentChat:cancelTask under the hood.

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

function registerProviderHandlers(channels: string[]): void {
  ipcMain.handle('providers:list', async () => {
    const providers = getAllProviders();
    const mapped = await Promise.all(
      providers.map(async (p) => {
        const hasKey = p.apiKey || (await hasSecureKey(`provider-key:${p.id}`));
        return { ...p, apiKey: hasKey ? '••••••••' : '' };
      }),
    );
    return mapped;
  });

  ipcMain.handle('providers:getSlots', () => {
    return getConfigValue('modelSlots');
  });

  ipcMain.handle('codex:listModels', () => listCodexModels());
  ipcMain.handle('codex:resolveThreadId', (_event, args: CodexThreadCaptureArgs) =>
    resolveCodexThreadId(args),
  );

  channels.push(
    'providers:list',
    'providers:getSlots',
    'codex:listModels',
    'codex:resolveThreadId',
  );
}

let handlersRegistered = false;
let allChannels: string[] = [];

/**
 * Register all ipcMain handlers. Handlers are registered globally (once) and
 * use `event.sender` to determine the calling window. Returns a cleanup
 * function that removes the handlers; only the *last* cleanup call actually
 * unregisters (since handlers are shared across windows).
 */
export function registerIpcHandlers(win: BrowserWindow): () => void {
  if (handlersRegistered) {
    return () => {
      /* no-op â€” handled globally */
    };
  }

  handlersRegistered = true;
  ensureSchedulerInit();
  allChannels = registerDomainHandlers(win);
  registerCodeModeHandlers(allChannels);
  registerProviderHandlers(allChannels);
  registerOrchestrationStubHandlers(allChannels);
  startApprovalManagerCleanup();

  return () => {
    cleanupIpcHandlers();
  };
}

export function cleanupIpcHandlers(): void {
  // Close all file watchers
  cleanupFileWatchers();

  // Close settings file watcher
  cleanupConfigWatcher();

  cleanupAgentChatHandlers();
  closeEmbeddingStore();
  stopApprovalManagerCleanup();

  // Stop all LSP servers
  lspStopAll().catch((error) => {
    log.error('Failed to stop LSP servers during cleanup:', error);
  });

  // Remove all handlers from ipcMain and the WebSocket bridge registry
  for (const channel of allChannels) {
    ipcMain.removeHandler(channel);
  }
  clearRegistry();

  allChannels = [];
  handlersRegistered = false;
}
