/**
 * Internal MCP server — exposes IDE tools to Claude Code sessions via SSE.
 * Started by main.ts `startBackgroundServices` after the hooks and IDE tool servers.
 * Auto-injects its URL into .claude/settings.json as the 'ouroboros' MCP entry.
 */
export { injectIntoProjectSettings, removeFromProjectSettings } from './internalMcpAutoInject';
export { startInternalMcpServer } from './internalMcpServer';
export type { InternalMcpServerHandle, InternalMcpServerOptions } from './internalMcpTypes';
