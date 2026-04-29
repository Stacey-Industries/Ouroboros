/**
 * internalMcp barrel (Wave 60 Phase E).
 *
 * Pre-Wave-60 this directory ran an in-process HTTP+SSE MCP server and a
 * stdio bridge. Both are deleted in Phase E. What remains:
 *
 *   - `injectIntoProjectSettings` / `removeFromProjectSettings` — write
 *     the ouroboros entry into `<root>/.mcp.json`. The entry now points
 *     at the standalone MCP server (`out/main/ouroborosMcp.js`) which
 *     Claude Code spawns whether the IDE is running or not.
 *   - `internalMcpScope` — task-gated scope decision (used by
 *     scopedMcpConfig + codemodeStartup).
 *   - `internalMcpTypes` — shared `McpToolDefinition` etc.
 *
 * `internalMcp.transport` config is no longer consulted — entry shape is
 * always the standalone. The field is accepted on InjectOptions for
 * back-compat with stale config files but ignored.
 */
import path from 'path';

import type { InjectOptions } from './internalMcpAutoInject';

export {
  injectIntoProjectSettings,
  type InjectOptions,
  removeFromProjectSettings,
} from './internalMcpAutoInject';
export { type InternalMcpTransport } from './internalMcpTypes';

/**
 * Build the inject options for the current build.
 *
 * Wave 60: the standalone is the only shape. `mainOutDir` is the
 * directory containing `ouroborosMcp.js`. Resolve to the absolute script
 * path; the auto-injector writes that into the entry's args.
 */
export function buildInjectOptions(mainOutDir: string): InjectOptions {
  return {
    stdioTransportPath: path.join(mainOutDir, 'ouroborosMcp.js'),
  };
}
