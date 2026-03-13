/**
 * ipc-handlers/index.ts — Orchestrator that imports all domain registrars,
 * calls them, collects channel names, and handles cleanup.
 */

export { registerPtyHandlers } from './pty'
export { registerConfigHandlers, cleanupConfigWatcher } from './config'
export { registerFileHandlers, cleanupFileWatchers } from './files'
export { registerGitHandlers } from './git'
export { registerAppHandlers } from './app'
export { registerSessionHandlers } from './sessions'
export { registerMiscHandlers, lspStopAll } from './misc'
export { registerMcpHandlers } from './mcp'
export { registerContextHandlers } from './context'
export { registerIdeToolsHandlers } from './ideTools'
