/**
 * internalMcpTools.ts — Tool registry for internal MCP server.
 *
 * Tool implementations live in sibling files:
 *   internalMcpToolsModules.ts  — search_modules, get_module, list_modules, get_module_files
 *   internalMcpToolsGraph.ts    — get_architecture, get_codebase_context, search_symbols,
 *                                  get_symbol, trace_imports, detect_changes
 *   internalMcpToolsHelpers.ts  — shared formatting helpers
 */

import { getGraphController } from '../codebaseGraph/graphController'
import { createGraphMcpTools } from '../codebaseGraph/mcpToolHandlers'
import {
  detectChangesTool,
  getArchitectureTool,
  getCodebaseContextTool,
  getSymbolTool,
  searchSymbolsTool,
  traceImportsTool,
} from './internalMcpToolsGraph'
import {
  getModuleFilesTool,
  getModuleTool,
  listModulesTool,
  searchModulesTool,
} from './internalMcpToolsModules'
import type { McpToolDefinition } from './internalMcpTypes'

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export const ALL_TOOLS: McpToolDefinition[] = [
  searchModulesTool,
  getModuleTool,
  listModulesTool,
  getArchitectureTool,
  getModuleFilesTool,
  getCodebaseContextTool,
  searchSymbolsTool,
  getSymbolTool,
  traceImportsTool,
  detectChangesTool,
]

/**
 * Return the active tool list. If the codebase graph is healthy, returns the
 * 14 graph-backed tools. Otherwise falls back to the context-layer module tools.
 */
export function getActiveTools(): McpToolDefinition[] {
  const graphCtrl = getGraphController()
  const graphContext = graphCtrl?.getGraphToolContext()

  if (graphContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createGraphMcpTools(graphContext as any)
  }

  return ALL_TOOLS
}

/** Look up a tool by name (searches active tools first, then fallback list) */
export function findTool(name: string): McpToolDefinition | undefined {
  return getActiveTools().find((t) => t.name === name)
}
