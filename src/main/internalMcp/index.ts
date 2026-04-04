/**
 * @deprecated UNWIRED — This module is fully implemented but never called from main.ts
 * or any startup path. No callers exist. See CLAUDE.md Known Issues / Tech Debt.
 *
 * Designed to: start an SSE MCP server on localhost, auto-inject its URL into
 * .claude/settings.json as the 'ouroboros' MCP server, and expose IDE tools
 * (graph queries, file ops, module navigation) to Claude Code sessions.
 */
export { injectIntoProjectSettings, removeFromProjectSettings } from './internalMcpAutoInject'
export { startInternalMcpServer } from './internalMcpServer'
export type { InternalMcpServerHandle, InternalMcpServerOptions } from './internalMcpTypes'
