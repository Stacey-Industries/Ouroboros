/**
 * Internal MCP server — exposes IDE tools to Claude Code sessions via SSE
 * (default) or stdio (Wave 51 Phase B opt-in via `internalMcp.transport`).
 * Started by main.ts `startBackgroundServices` after the hooks and IDE tool
 * servers. Auto-injects an entry into .claude/settings.json as 'ouroboros'.
 */
import path from 'path';

import { getConfigValue } from '../config';
import type { InjectOptions } from './internalMcpAutoInject';
import type { InternalMcpTransport } from './internalMcpTypes';

export {
  injectIntoProjectSettings,
  type InjectOptions,
  removeFromProjectSettings,
} from './internalMcpAutoInject';
export { startInternalMcpServer } from './internalMcpServer';
// Wave 53j: the stdio bridge is now a self-contained CLI script using the
// SDK's StdioServerTransport + SSEClientTransport. Its main() runs only when
// the script is the entry point (gated by isScriptEntry), and there are no
// other consumers — the prior `dispatchMessage`/`runStdioTransport` helpers
// were artifacts of the hand-rolled implementation that this barrel
// re-exported for tests. New tests import the helpers (`parsePort`,
// `createProxyServer`) directly from the module file.
export {
  type InternalMcpServerHandle,
  type InternalMcpServerOptions,
  type InternalMcpTransport,
} from './internalMcpTypes';

/** Resolves `internalMcp.transport` from config; defaults to 'sse'. */
export function resolveInternalMcpTransport(): InternalMcpTransport {
  const cfg = getConfigValue('internalMcp') as { transport?: string } | undefined;
  return cfg?.transport === 'stdio' ? 'stdio' : 'sse';
}

/**
 * Build the inject options for the current config.
 *
 * Wave 60 Phase C: the entry now points at the standalone MCP server
 * (`ouroborosMcp.js`), not the stdio→SSE bridge. The standalone reads the
 * SQLite DB directly and works whether the IDE is running or not. The
 * legacy `internalMcp.transport` config is honored for back-compat
 * (returns no path when sse is selected, matching pre-Wave-60 behavior),
 * but Wave 60 effectively makes 'stdio' the only meaningful value — the
 * IDE's HTTP+SSE server itself is deleted in Phase E.
 */
export function buildInjectOptions(mainOutDir: string): InjectOptions {
  const transport = resolveInternalMcpTransport();
  if (transport !== 'stdio') return { transport };
  return {
    transport,
    stdioTransportPath: path.join(mainOutDir, 'ouroborosMcp.js'),
  };
}
