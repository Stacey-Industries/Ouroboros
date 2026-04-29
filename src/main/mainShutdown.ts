/**
 * mainShutdown.ts — Shutdown orchestration for the Electron main process.
 *
 * Extracted from main.ts so that `will-quit` cleanup can properly await
 * async resources (notably the codebase-graph indexing worker and SQLite
 * handles) without racing Node's environment teardown. See the graceful
 * dispose protocol in `codebaseGraph/indexingWorker.ts` for context.
 */

import { closeThreadStore } from './agentChat/threadStore';
import { stopClaudeUsagePoller } from './claudeUsagePoller';
import { disableCodeModeUserLevel } from './codemode/codemodeStartup';
import { closeCostHistoryDb } from './costHistory';
import { shutdownExtensionHost } from './extensionHost/extensionHostProxy';
import { cleanupIpcHandlers } from './ipc';
import log from './logger';
import { closeEditProvenance, disposeCodebaseGraph } from './mainStartup';
import { closeDecisionWriter } from './orchestration/contextDecisionWriter';
import { closeOutcomeWriter } from './orchestration/contextOutcomeWriter';
import { shutdownCodexAppServerProcesses } from './orchestration/providers/codexAppServerProcess';
import { deleteTokenFile } from './pipeAuth';
import { closeCorrectionWriter } from './research/correctionWriter';
import { closeResearchOutcomeWriter } from './research/researchOutcomeWriter';
import { clearQualityTimers } from './router/qualitySignalCollector';
import { stopObserving as stopRetrainObserver } from './router/retrainTrigger';
import { closeSessionServices } from './session/sessionStartup';
import { closeOutcomeObserver, closeTelemetryStore } from './telemetry';

async function tryShutdown(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.warn(`${label} shutdown error:`, err);
  }
}

async function closeWriters(): Promise<void> {
  await closeDecisionWriter();
  await closeOutcomeWriter();
  await closeResearchOutcomeWriter();
  await closeCorrectionWriter();
}

function closeSyncStores(): void {
  closeOutcomeObserver();
  closeTelemetryStore();
  closeEditProvenance();
  stopRetrainObserver();
  clearQualityTimers();
}

async function disposeSubsystems(): Promise<void> {
  await tryShutdown('codebase-graph', disposeCodebaseGraph);
  await tryShutdown('codex-app-server', shutdownCodexAppServerProcesses);
  await tryShutdown('extension-host', shutdownExtensionHost);
  // Wave 60 Phase E: no legacy MCP host cleanup remains here. The
  // standalone server is spawned and owned by Claude Code, not the IDE.
}

export async function performWillQuitShutdown(): Promise<void> {
  await tryShutdown('codemode-user-level', disableCodeModeUserLevel);
  closeSessionServices();
  await closeWriters();
  closeSyncStores();
  await stopClaudeUsagePoller();
  await cleanupIpcHandlers();
  closeCostHistoryDb();
  closeThreadStore();
  deleteTokenFile();
  await disposeSubsystems();
}
