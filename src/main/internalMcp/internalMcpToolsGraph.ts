/**
 * internalMcpToolsGraph.ts — High-level and graph-aware MCP tools.
 * Extracted from internalMcpTools.ts to stay under the 300-line limit.
 */

import { getContextLayerController } from '../contextLayer/contextLayerController'
import { readModuleEntry, readRepoMap } from '../contextLayer/contextLayerStore'
import {
  filterChangedFilesForModule,
  formatArchitectureBody,
  formatChangedModuleLines,
  formatImportGraphLines,
  formatSymbolDetail,
  formatSymbolSearchResults,
} from './internalMcpToolsHelpers'
import { truncate, validateModuleId } from './internalMcpToolsModules'
import type { McpToolDefinition } from './internalMcpTypes'

// ---------------------------------------------------------------------------
// Tool: get_architecture
// ---------------------------------------------------------------------------

export const getArchitectureTool: McpToolDefinition = {
  name: 'get_architecture',
  description: 'Get a high-level architectural overview: project name, languages, frameworks, module count, and cross-module dependency graph.',
  inputSchema: { type: 'object', properties: {} },
  async handler(_args, workspaceRoot) {
    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    return truncate(formatArchitectureBody(repoMap).join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_codebase_context
// ---------------------------------------------------------------------------

export const getCodebaseContextTool: McpToolDefinition = {
  name: 'get_codebase_context',
  description: 'Get a combined orientation snapshot: architecture overview + top modules with descriptions. Use at the start of a session to orient quickly.',
  inputSchema: {
    type: 'object',
    properties: {
      maxModules: { type: 'number', description: 'Maximum number of modules to include (default 15)' },
    },
  },
  async handler(args, workspaceRoot) {
    const maxModules = typeof args.maxModules === 'number' ? Math.max(1, Math.min(args.maxModules, 50)) : 15

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const lines: string[] = [
      `# Codebase Context: ${repoMap.projectName}`,
      `Modules: ${repoMap.moduleCount} | Files: ${repoMap.totalFileCount}`,
      `Languages: ${repoMap.languages.join(', ')}`,
      `Frameworks: ${repoMap.frameworks.join(', ')}`,
      '',
    ]

    const sorted = [...repoMap.modules]
      .sort((a, b) => b.structural.fileCount - a.structural.fileCount)
      .slice(0, maxModules)

    lines.push(`## Top ${sorted.length} Modules`)
    lines.push('')

    for (const entry of sorted) {
      const m = entry.structural.module
      const moduleEntry = await readModuleEntry(workspaceRoot, m.id)
      const desc = moduleEntry?.ai?.description ?? '(no summary yet)'
      lines.push(`### ${m.label} (${m.id})`)
      lines.push(`Path: ${m.rootPath} | Files: ${entry.structural.fileCount}`)
      lines.push(desc)
      lines.push('')
    }

    if (repoMap.crossModuleDependencies.length > 0) {
      lines.push('## Key Dependencies')
      const top = [...repoMap.crossModuleDependencies]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 20)
      for (const dep of top) lines.push(`  ${dep.from} → ${dep.to}`)
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: search_symbols
// ---------------------------------------------------------------------------

export const searchSymbolsTool: McpToolDefinition = {
  name: 'search_symbols',
  description: 'Search for exported functions, classes, interfaces, and types by name across the entire codebase. Returns symbol name, kind, signature, module, and file location.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Name substring to search for (case-insensitive)' },
      kind: {
        type: 'string',
        enum: ['function', 'class', 'interface', 'type', 'const', 'enum', 'unknown'],
        description: 'Optional: filter by symbol kind',
      },
      moduleId: { type: 'string', description: 'Optional: restrict search to a specific module' },
      limit: { type: 'number', description: 'Max results (default 20)' },
    },
    required: ['query'],
  },
  async handler(args) {
    const ctrl = getContextLayerController()
    if (!ctrl || ctrl.getSymbolIndex().size === 0) {
      return 'Symbol index not yet built. Summarization may still be in progress. Try calling list_modules first to check status.'
    }

    const query = typeof args.query === 'string' ? args.query : ''
    const kindFilter = typeof args.kind === 'string' ? args.kind : null
    const moduleIdFilter = typeof args.moduleId === 'string' ? args.moduleId : null
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(args.limit, 100)) : 20

    let results = ctrl.getSymbolIndex().searchByName(query, 200)
    if (kindFilter) results = results.filter((s) => s.kind === kindFilter)
    if (moduleIdFilter) results = results.filter((s) => s.moduleId === moduleIdFilter)
    results = results.slice(0, limit)

    return truncate(formatSymbolSearchResults(query, kindFilter, moduleIdFilter, results))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_symbol
// ---------------------------------------------------------------------------

export const getSymbolTool: McpToolDefinition = {
  name: 'get_symbol',
  description: 'Get detailed information about a specific exported symbol: its full signature, which module it belongs to, and its file location.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact or partial symbol name (case-insensitive)' },
      moduleId: { type: 'string', description: 'Optional: narrow to a specific module' },
    },
    required: ['name'],
  },
  async handler(args) {
    const ctrl = getContextLayerController()
    if (!ctrl || ctrl.getSymbolIndex().size === 0) {
      return 'Symbol index not yet built. Summarization may still be in progress. Try calling list_modules first to check status.'
    }

    const name = typeof args.name === 'string' ? args.name : ''
    const moduleIdFilter = typeof args.moduleId === 'string' ? args.moduleId : null

    let results = ctrl.getSymbolIndex().searchByName(name, 50)
    if (moduleIdFilter) results = results.filter((s) => s.moduleId === moduleIdFilter)
    results = results.slice(0, 5)

    if (results.length === 0) {
      return `No symbols found for name "${name}"${moduleIdFilter ? ` in module "${moduleIdFilter}"` : ''}.`
    }

    return truncate(formatSymbolDetail(results))
  },
}

// ---------------------------------------------------------------------------
// Tool: trace_imports
// ---------------------------------------------------------------------------

export const traceImportsTool: McpToolDefinition = {
  name: 'trace_imports',
  description: 'Show the import dependency graph for a module — which modules it imports from and which modules import from it. Note: these are file-level import edges, not function-call edges.',
  inputSchema: {
    type: 'object',
    properties: {
      moduleId: { type: 'string', description: 'The module ID to trace (e.g. "orchestration", "file-viewer")' },
      direction: {
        type: 'string',
        enum: ['imports', 'imported_by', 'both'],
        description: 'Default: both',
      },
    },
    required: ['moduleId'],
  },
  async handler(args) {
    const ctrl = getContextLayerController()
    const repoMap = ctrl?.getRepoMap()
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const moduleId = validateModuleId(args.moduleId)
    const direction = typeof args.direction === 'string' ? args.direction : 'both'

    const moduleExists = repoMap.modules.some((e) => e.structural.module.id === moduleId)
    if (!moduleExists) return `Module "${moduleId}" not found. Use list_modules to see available modules.`

    return truncate(formatImportGraphLines(moduleId, repoMap, direction).join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: detect_changes
// ---------------------------------------------------------------------------

export const detectChangesTool: McpToolDefinition = {
  name: 'detect_changes',
  description: 'Show which modules contain uncommitted git changes and which exported symbols are in those files. Useful for understanding the blast radius of current work.',
  inputSchema: { type: 'object', properties: {} },
  async handler(_args, workspaceRoot) {
    const ctrl = getContextLayerController()
    const repoMap = ctrl?.getRepoMap()
    const repoFacts = ctrl?.getLastRepoFacts()

    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const changedModules = repoMap.modules.filter((e) => e.structural.recentlyChanged)
    if (changedModules.length === 0) return 'No recently changed modules detected. The workspace appears clean.'

    const lines: string[] = [`Changed modules (${changedModules.length}):`, '']

    for (const entry of changedModules) {
      const m = entry.structural.module
      const moduleRoot = m.rootPath.replace(/\\/g, '/').toLowerCase()
      const changedFilesForModule = filterChangedFilesForModule(repoFacts?.gitDiff?.changedFiles, moduleRoot)
      const stored = await readModuleEntry(workspaceRoot, m.id)
      const symbols = stored?.structural.extractedSymbols ?? []
      formatChangedModuleLines(entry, changedFilesForModule, symbols, lines)
    }

    return truncate(lines.join('\n'))
  },
}
