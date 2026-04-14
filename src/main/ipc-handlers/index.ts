/**
 * ipc-handlers/index.ts — Orchestrator that imports all domain registrars,
 * calls them, collects channel names, and handles cleanup.
 */

export { cleanupAgentChatHandlers, registerAgentChatHandlers } from './agentChat';
export { registerAgentConflictHandlers } from './agentConflict';
export { registerAiHandlers } from './aiHandlers';
export { registerAiStreamHandlers } from './aiStreamHandler';
export { registerAppHandlers } from './app';
export { registerAuthHandlers } from './auth';
export { ensureSchedulerInit, registerBackgroundJobsHandlers } from './backgroundJobs';
export { registerCheckpointHandlers } from './checkpoint';
export { registerClaudeMdHandlers } from './claudeMd';
export { cleanupConfigWatcher, registerConfigHandlers } from './config';
export { registerContextHandlers } from './context';
export { closeEmbeddingStore, registerEmbeddingHandlers } from './embeddingHandlers';
export { registerExtensionStoreHandlers } from './extensionStore';
export { cleanupFileWatchers, registerFileHandlers } from './files';
export { registerGitHandlers } from './git';
export { registerIdeToolsHandlers } from './ideTools';
export { registerMcpHandlers } from './mcp';
export { registerMcpStoreHandlers } from './mcpStore';
export { lspStopAll, registerMiscHandlers } from './misc';
export { registerPtyHandlers } from './pty';
export { registerPtyPersistenceHandlers } from './ptyPersistence';
export { registerRouterStatsHandlers } from './routerStats';
export { registerRulesAndSkillsHandlers } from './rulesAndSkills';
export { registerSearchHandlers } from './search';
export { registerSessionHandlers } from './sessions';
export { registerSpecHandlers } from './specScaffold';
