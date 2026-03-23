/**
 * ipc-handlers/index.ts — Orchestrator that imports all domain registrars,
 * calls them, collects channel names, and handles cleanup.
 */

export { cleanupAgentChatHandlers, registerAgentChatHandlers } from './agentChat';
export { registerAppHandlers } from './app';
export { registerAuthHandlers } from './auth';
export { registerClaudeMdHandlers } from './claudeMd';
export { cleanupConfigWatcher, registerConfigHandlers } from './config';
export { registerContextHandlers } from './context';
export { registerExtensionStoreHandlers } from './extensionStore';
export { cleanupFileWatchers, registerFileHandlers } from './files';
export { registerGitHandlers } from './git';
export { registerIdeToolsHandlers } from './ideTools';
export { registerMcpHandlers } from './mcp';
export { registerMcpStoreHandlers } from './mcpStore';
export { lspStopAll, registerMiscHandlers } from './misc';
export { registerPtyHandlers } from './pty';
export { registerSessionHandlers } from './sessions';
