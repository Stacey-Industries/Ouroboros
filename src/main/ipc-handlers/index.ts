/**
 * ipc-handlers/index.ts — Orchestrator that imports all domain registrars,
 * calls them, collects channel names, and handles cleanup.
 */

export { cleanupPairingHandlers, registerPairingHandlers } from '../mobileAccess/pairingHandlers';
export { cleanupAgentChatHandlers, registerAgentChatHandlers } from './agentChat';
export { registerAgentConflictHandlers } from './agentConflict';
export { registerAiHandlers } from './aiHandlers';
export { registerAiStreamHandlers } from './aiStreamHandler';
export { registerAppHandlers } from './app';
export { registerAuthHandlers } from './auth';
export { ensureSchedulerInit, registerBackgroundJobsHandlers } from './backgroundJobs';
export { registerCheckpointHandlers } from './checkpoint';
export { registerClaudeMdHandlers } from './claudeMd';
export {
  cleanupCompareProvidersHandlers,
  registerCompareProvidersHandlers,
} from './compareProvidersHandlers';
export { cleanupConfigWatcher, registerConfigHandlers } from './config';
export { registerContextHandlers } from './context';
export {
  cleanupContextRankerDashboardHandlers,
  registerContextRankerDashboardHandlers,
} from './contextRankerDashboardHandlers';
export { closeEmbeddingStore, registerEmbeddingHandlers } from './embeddingHandlers';
export { registerExtensionStoreHandlers } from './extensionStore';
export { cleanupFileWatchers, registerFileHandlers } from './files';
export { cleanupFolderCrudHandlers, registerFolderCrudHandlers } from './folderCrud';
export { registerGitHandlers } from './git';
export { registerIdeToolsHandlers } from './ideTools';
export { cleanupLayoutHandlers, registerLayoutHandlers } from './layout';
export { registerMcpHandlers } from './mcp';
export { registerMcpStoreHandlers } from './mcpStore';
export { lspStopAll, registerMiscHandlers } from './misc';
export { cleanupPinnedContextHandlers, registerPinnedContextHandlers } from './pinnedContext';
export { cleanupProfileCrudHandlers, registerProfileCrudHandlers } from './profileCrud';
export { registerPtyHandlers } from './pty';
export { registerPtyPersistenceHandlers } from './ptyPersistence';
export { cleanupResearchHandlers, registerResearchHandlers } from './research';
export {
  cleanupResearchControlHandlers,
  registerResearchControlHandlers,
} from './researchControl';
export {
  cleanupResearchDashboardHandlers,
  registerResearchDashboardHandlers,
} from './researchDashboardHandlers';
export { registerRouterStatsHandlers } from './routerStats';
export { registerRulesAndSkillsHandlers } from './rulesAndSkills';
export { registerSearchHandlers } from './search';
export { cleanupSessionCrudHandlers, registerSessionCrudHandlers } from './sessionCrud';
export {
  cleanupDispatchHandlers,
  registerDispatchHandlers,
} from './sessionDispatchHandlers';
export { registerSessionHandlers } from './sessions';
export { registerSpecHandlers } from './specScaffold';
export { registerSubagentHandlers } from './subagent';
export {
  cleanupSystemPromptHandlers,
  registerSystemPromptHandlers,
} from './systemPromptHandlers';
export { cleanupTelemetryHandlers, registerTelemetryHandlers } from './telemetry';
export {
  cleanupWorkspaceReadListHandlers,
  registerWorkspaceReadListHandlers,
} from './workspaceReadList';
export { cleanupWorktreeHandlers, registerWorktreeHandlers } from './worktree';
