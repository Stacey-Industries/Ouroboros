import fs from 'fs/promises'
import path from 'path'
import { readRepoMap, readModuleEntry } from '../contextLayer/contextLayerStore'
import { getContextLayerController } from '../contextLayer/contextLayerController'
import { getGraphController } from '../codebaseGraph/graphController'
import { createGraphMcpTools } from '../codebaseGraph/mcpToolHandlers'
import type { McpToolDefinition } from './internalMcpTypes'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RESPONSE_CHARS = 8000
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h'])

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function validateModuleId(moduleId: unknown): string {
  if (typeof moduleId !== 'string' || moduleId.length === 0) {
    throw new Error('moduleId must be a non-empty string')
  }
  if (moduleId.includes('..') || path.isAbsolute(moduleId) || moduleId.includes('\\')) {
    throw new Error('moduleId contains invalid path characters')
  }
  return moduleId
}

function truncate(text: string): string {
  if (text.length <= MAX_RESPONSE_CHARS) return text
  return text.slice(0, MAX_RESPONSE_CHARS) + '\n\n[Response truncated to 8000 chars]'
}

// ---------------------------------------------------------------------------
// Recursive directory listing filtered by source extensions
// ---------------------------------------------------------------------------

async function listSourceFiles(dirPath: string, workspaceRoot: string): Promise<string[]> {
  const results: string[] = []
  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        // Skip hidden dirs and node_modules
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext)) {
          results.push(path.relative(workspaceRoot, fullPath).replace(/\\/g, '/'))
        }
      }
    }
  }
  await walk(dirPath)
  return results.sort()
}

// ---------------------------------------------------------------------------
// Tool: search_modules
// ---------------------------------------------------------------------------

const searchModulesTool: McpToolDefinition = {
  name: 'search_modules',
  description: 'Search for modules in the codebase by name, path, or keyword. Returns module IDs, labels, paths, file counts, and AI descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (case-insensitive substring match on id, label, or rootPath)' },
      limit: { type: 'number', description: 'Maximum number of results (default 10)' },
    },
    required: ['query'],
  },
  async handler(args, workspaceRoot) {
    const query = typeof args.query === 'string' ? args.query.toLowerCase() : ''
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(args.limit, 50)) : 10

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const matches = repoMap.modules.filter((entry) => {
      const m = entry.structural.module
      return (
        m.id.toLowerCase().includes(query) ||
        m.label.toLowerCase().includes(query) ||
        m.rootPath.toLowerCase().includes(query)
      )
    }).slice(0, limit)

    if (matches.length === 0) {
      return `No modules found matching "${args.query}".`
    }

    const lines: string[] = [`Found ${matches.length} module(s) matching "${args.query}":\n`]

    for (const entry of matches) {
      const m = entry.structural.module
      const moduleEntry = await readModuleEntry(workspaceRoot, m.id)
      const description = moduleEntry?.ai?.description ?? '(no AI summary yet)'
      lines.push(`Module: ${m.id}`)
      lines.push(`  Label:    ${m.label}`)
      lines.push(`  Path:     ${m.rootPath}`)
      lines.push(`  Files:    ${entry.structural.fileCount}`)
      lines.push(`  Pattern:  ${m.pattern}`)
      lines.push(`  Summary:  ${description}`)
      lines.push('')
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_module
// ---------------------------------------------------------------------------

const getModuleTool: McpToolDefinition = {
  name: 'get_module',
  description: 'Get full details for a specific module: AI summary, responsibilities, gotchas, exported symbols, and structural info.',
  inputSchema: {
    type: 'object',
    properties: {
      moduleId: { type: 'string', description: 'The module ID (e.g. "renderer-file-viewer")' },
    },
    required: ['moduleId'],
  },
  async handler(args, workspaceRoot) {
    const moduleId = validateModuleId(args.moduleId)

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const repoEntry = repoMap.modules.find((e) => e.structural.module.id === moduleId)
    if (!repoEntry) {
      return `Module "${moduleId}" not found. Use list_modules to see available modules.`
    }

    const entry = await readModuleEntry(workspaceRoot, moduleId)
    if (!entry) {
      return `Module "${moduleId}" found in repo map but details not available yet.`
    }

    const s = entry.structural
    const m = s.module
    const lines: string[] = []

    lines.push(`# Module: ${m.label} (${m.id})`)
    lines.push(`Path:    ${m.rootPath}`)
    lines.push(`Pattern: ${m.pattern}`)
    lines.push(`Files:   ${s.fileCount} | Lines: ${s.totalLines}`)
    lines.push(`Languages: ${s.languages.join(', ') || 'unknown'}`)
    lines.push(`Recently changed: ${s.recentlyChanged ? 'yes' : 'no'}`)
    lines.push('')

    if (entry.ai) {
      lines.push('## AI Summary')
      lines.push(entry.ai.description)
      lines.push('')

      if (entry.ai.keyResponsibilities.length > 0) {
        lines.push('## Key Responsibilities')
        for (const r of entry.ai.keyResponsibilities) {
          lines.push(`- ${r}`)
        }
        lines.push('')
      }

      if (entry.ai.gotchas.length > 0) {
        lines.push('## Gotchas')
        for (const g of entry.ai.gotchas) {
          lines.push(`- ${g}`)
        }
        lines.push('')
      }
    } else {
      lines.push('## AI Summary')
      lines.push('(not yet generated)')
      lines.push('')
    }

    if (s.exports.length > 0) {
      lines.push('## Exports')
      lines.push(s.exports.slice(0, 30).join(', '))
      if (s.exports.length > 30) lines.push(`... and ${s.exports.length - 30} more`)
      lines.push('')
    }

    if (s.extractedSymbols && s.extractedSymbols.length > 0) {
      lines.push('## Extracted Symbols')
      for (const sym of s.extractedSymbols.slice(0, 20)) {
        const sig = sym.signature ? `: ${sym.signature}` : ''
        lines.push(`- [${sym.kind}] ${sym.name}${sig}`)
      }
      if (s.extractedSymbols.length > 20) lines.push(`... and ${s.extractedSymbols.length - 20} more`)
      lines.push('')
    }

    if (s.entryPoints.length > 0) {
      lines.push('## Entry Points')
      lines.push(s.entryPoints.join(', '))
      lines.push('')
    }

    // Cross-module deps
    const deps = repoMap.crossModuleDependencies.filter((d) => d.from === moduleId)
    if (deps.length > 0) {
      lines.push('## Dependencies (this module imports)')
      for (const dep of deps) {
        lines.push(`- ${dep.to} (weight: ${dep.weight})`)
      }
      lines.push('')
    }

    const callers = repoMap.crossModuleDependencies.filter((d) => d.to === moduleId)
    if (callers.length > 0) {
      lines.push('## Used by')
      for (const c of callers) {
        lines.push(`- ${c.from} (weight: ${c.weight})`)
      }
      lines.push('')
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: list_modules
// ---------------------------------------------------------------------------

const listModulesTool: McpToolDefinition = {
  name: 'list_modules',
  description: 'List all modules in the codebase with brief descriptions. Use this to orient yourself before diving into specific modules.',
  inputSchema: {
    type: 'object',
    properties: {
      includeDescriptions: {
        type: 'boolean',
        description: 'Include AI descriptions (default true)',
      },
    },
  },
  async handler(args, workspaceRoot) {
    const includeDescriptions = args.includeDescriptions !== false

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const lines: string[] = [
      `Project: ${repoMap.projectName}`,
      `Modules: ${repoMap.moduleCount} | Files: ${repoMap.totalFileCount}`,
      `Languages: ${repoMap.languages.join(', ')}`,
      `Frameworks: ${repoMap.frameworks.join(', ')}`,
      '',
    ]

    // Sort modules by id for stable output
    const sorted = [...repoMap.modules].sort((a, b) =>
      a.structural.module.id.localeCompare(b.structural.module.id),
    )

    for (const entry of sorted) {
      const m = entry.structural.module
      if (includeDescriptions) {
        const moduleEntry = await readModuleEntry(workspaceRoot, m.id)
        const desc = moduleEntry?.ai?.description ?? '(no summary)'
        lines.push(`${m.id}`)
        lines.push(`  ${m.rootPath} (${entry.structural.fileCount} files) — ${desc}`)
      } else {
        lines.push(`${m.id}  ${m.rootPath}  (${entry.structural.fileCount} files)`)
      }
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_architecture
// ---------------------------------------------------------------------------

const getArchitectureTool: McpToolDefinition = {
  name: 'get_architecture',
  description: 'Get a high-level architectural overview: project name, languages, frameworks, module count, and cross-module dependency graph.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(_args, workspaceRoot) {
    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const lines: string[] = []
    lines.push(`# Architecture: ${repoMap.projectName}`)
    lines.push(`Generated: ${new Date(repoMap.generatedAt).toISOString()}`)
    lines.push('')
    lines.push(`## Overview`)
    lines.push(`Modules:    ${repoMap.moduleCount}`)
    lines.push(`Total files: ${repoMap.totalFileCount}`)
    lines.push(`Languages:  ${repoMap.languages.join(', ')}`)
    lines.push(`Frameworks: ${repoMap.frameworks.join(', ')}`)
    lines.push('')

    // Group modules by inferred process boundary (heuristic for Electron projects)
    const mainModules = repoMap.modules.filter((e) => e.structural.module.rootPath.startsWith('src/main'))
    const preloadModules = repoMap.modules.filter((e) => e.structural.module.rootPath.startsWith('src/preload'))
    const rendererModules = repoMap.modules.filter((e) => e.structural.module.rootPath.startsWith('src/renderer'))
    const otherModules = repoMap.modules.filter((e) =>
      !e.structural.module.rootPath.startsWith('src/main') &&
      !e.structural.module.rootPath.startsWith('src/preload') &&
      !e.structural.module.rootPath.startsWith('src/renderer'),
    )

    function formatModuleGroup(label: string, modules: typeof repoMap.modules): void {
      if (modules.length === 0) return
      lines.push(`## ${label} (${modules.length})`)
      for (const entry of modules) {
        const m = entry.structural.module
        lines.push(`  ${m.id}  [${m.rootPath}]  ${entry.structural.fileCount} files`)
      }
      lines.push('')
    }

    formatModuleGroup('Main Process', mainModules)
    formatModuleGroup('Preload', preloadModules)
    formatModuleGroup('Renderer', rendererModules)
    formatModuleGroup('Other', otherModules)

    // Cross-module dependency graph
    if (repoMap.crossModuleDependencies.length > 0) {
      lines.push(`## Cross-Module Dependencies`)
      // Sort by weight descending
      const sorted = [...repoMap.crossModuleDependencies].sort((a, b) => b.weight - a.weight)
      for (const dep of sorted) {
        lines.push(`  ${dep.from} → ${dep.to} (weight: ${dep.weight})`)
      }
      lines.push('')
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_module_files
// ---------------------------------------------------------------------------

const getModuleFilesTool: McpToolDefinition = {
  name: 'get_module_files',
  description: 'List the source files belonging to a specific module.',
  inputSchema: {
    type: 'object',
    properties: {
      moduleId: { type: 'string', description: 'The module ID' },
    },
    required: ['moduleId'],
  },
  async handler(args, workspaceRoot) {
    const moduleId = validateModuleId(args.moduleId)

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const repoEntry = repoMap.modules.find((e) => e.structural.module.id === moduleId)
    if (!repoEntry) {
      return `Module "${moduleId}" not found. Use list_modules to see available modules.`
    }

    const rootPath = repoEntry.structural.module.rootPath
    const absoluteRootPath = path.join(workspaceRoot, rootPath)

    const lines: string[] = [
      `# Files in module: ${repoEntry.structural.module.label} (${moduleId})`,
      `Root path: ${rootPath}`,
      '',
    ]

    let files: string[]
    try {
      files = await listSourceFiles(absoluteRootPath, workspaceRoot)
    } catch (err) {
      lines.push(`(Could not list files: ${err instanceof Error ? err.message : String(err)})`)
      return truncate(lines.join('\n'))
    }

    if (files.length === 0) {
      lines.push('(No source files found in this module path)')
    } else {
      lines.push(`${files.length} source file(s):`)
      lines.push('')
      for (const f of files) {
        lines.push(`  ${f}`)
      }
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_codebase_context
// ---------------------------------------------------------------------------

const getCodebaseContextTool: McpToolDefinition = {
  name: 'get_codebase_context',
  description: 'Get a combined orientation snapshot: architecture overview + top modules with descriptions. Use at the start of a session to orient quickly.',
  inputSchema: {
    type: 'object',
    properties: {
      maxModules: {
        type: 'number',
        description: 'Maximum number of modules to include (default 15)',
      },
    },
  },
  async handler(args, workspaceRoot) {
    const maxModules = typeof args.maxModules === 'number' ? Math.max(1, Math.min(args.maxModules, 50)) : 15

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const lines: string[] = []

    // Architecture overview
    lines.push(`# Codebase Context: ${repoMap.projectName}`)
    lines.push(`Modules: ${repoMap.moduleCount} | Files: ${repoMap.totalFileCount}`)
    lines.push(`Languages: ${repoMap.languages.join(', ')}`)
    lines.push(`Frameworks: ${repoMap.frameworks.join(', ')}`)
    lines.push('')

    // Top modules with descriptions
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

    // Dependency graph (compact)
    if (repoMap.crossModuleDependencies.length > 0) {
      lines.push('## Key Dependencies')
      const top = [...repoMap.crossModuleDependencies]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 20)
      for (const dep of top) {
        lines.push(`  ${dep.from} → ${dep.to}`)
      }
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: search_symbols
// ---------------------------------------------------------------------------

const searchSymbolsTool: McpToolDefinition = {
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
  async handler(args, _workspaceRoot) {
    const ctrl = getContextLayerController()
    if (!ctrl || ctrl.getSymbolIndex().size === 0) {
      return 'Symbol index not yet built. Summarization may still be in progress. Try calling list_modules first to check status.'
    }

    const query = typeof args.query === 'string' ? args.query : ''
    const kindFilter = typeof args.kind === 'string' ? args.kind : null
    const moduleIdFilter = typeof args.moduleId === 'string' ? args.moduleId : null
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(args.limit, 100)) : 20

    let results = ctrl.getSymbolIndex().searchByName(query, 200) // fetch more for filtering
    if (kindFilter) {
      results = results.filter((s) => s.kind === kindFilter)
    }
    if (moduleIdFilter) {
      results = results.filter((s) => s.moduleId === moduleIdFilter)
    }
    results = results.slice(0, limit)

    if (results.length === 0) {
      return `No symbols found matching "${query}"${kindFilter ? ` (kind: ${kindFilter})` : ''}${moduleIdFilter ? ` (module: ${moduleIdFilter})` : ''}.`
    }

    const lines: string[] = [
      `Found ${results.length} symbol(s) matching "${query}":\n`,
    ]

    for (const sym of results) {
      const loc = sym.filePath ? `${sym.filePath}:${sym.line}` : `${sym.moduleId}:${sym.line}`
      lines.push(`[${sym.kind}] ${sym.name}  (${sym.moduleId} — ${loc})`)
      if (sym.signature) {
        lines.push(`  signature: ${sym.signature}`)
      }
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: get_symbol
// ---------------------------------------------------------------------------

const getSymbolTool: McpToolDefinition = {
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
  async handler(args, _workspaceRoot) {
    const ctrl = getContextLayerController()
    if (!ctrl || ctrl.getSymbolIndex().size === 0) {
      return 'Symbol index not yet built. Summarization may still be in progress. Try calling list_modules first to check status.'
    }

    const name = typeof args.name === 'string' ? args.name : ''
    const moduleIdFilter = typeof args.moduleId === 'string' ? args.moduleId : null

    let results = ctrl.getSymbolIndex().searchByName(name, 50)
    if (moduleIdFilter) {
      results = results.filter((s) => s.moduleId === moduleIdFilter)
    }
    results = results.slice(0, 5)

    if (results.length === 0) {
      return `No symbols found for name "${name}"${moduleIdFilter ? ` in module "${moduleIdFilter}"` : ''}.`
    }

    const lines: string[] = []

    for (const sym of results) {
      const loc = sym.filePath ? `${sym.filePath}:${sym.line}` : `line ${sym.line}`
      lines.push(`# ${sym.name}`)
      lines.push(`Kind:    ${sym.kind}`)
      lines.push(`Module:  ${sym.moduleId}`)
      lines.push(`File:    ${loc}`)
      if (sym.signature) {
        lines.push(`Signature: ${sym.signature}`)
      }
      lines.push('')
    }

    if (results.length === 5) {
      lines.push('(showing first 5 matches — use moduleId to narrow results)')
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: trace_imports
// ---------------------------------------------------------------------------

const traceImportsTool: McpToolDefinition = {
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
  async handler(args, _workspaceRoot) {
    const ctrl = getContextLayerController()
    const repoMap = ctrl?.getRepoMap()
    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    const moduleId = validateModuleId(args.moduleId)
    const direction = typeof args.direction === 'string' ? args.direction : 'both'

    // Verify the module exists
    const moduleExists = repoMap.modules.some((e) => e.structural.module.id === moduleId)
    if (!moduleExists) {
      return `Module "${moduleId}" not found. Use list_modules to see available modules.`
    }

    const lines: string[] = [
      `# Import graph for: ${moduleId}`,
      `(Note: edges represent file-level imports, not function-call relationships)`,
      '',
    ]

    if (direction === 'imports' || direction === 'both') {
      const imports = repoMap.crossModuleDependencies
        .filter((dep) => dep.from === moduleId)
        .sort((a, b) => b.weight - a.weight)

      lines.push(`## ${moduleId} imports:`)
      if (imports.length === 0) {
        lines.push('  (no cross-module imports)')
      } else {
        for (const dep of imports) {
          lines.push(`  → ${dep.to} (weight: ${dep.weight})`)
        }
      }
      lines.push('')
    }

    if (direction === 'imported_by' || direction === 'both') {
      const importedBy = repoMap.crossModuleDependencies
        .filter((dep) => dep.to === moduleId)
        .sort((a, b) => b.weight - a.weight)

      lines.push(`## ${moduleId} is imported by:`)
      if (importedBy.length === 0) {
        lines.push('  (no modules import this module)')
      } else {
        for (const dep of importedBy) {
          lines.push(`  ← ${dep.from} (weight: ${dep.weight})`)
        }
      }
      lines.push('')
    }

    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: detect_changes
// ---------------------------------------------------------------------------

const detectChangesTool: McpToolDefinition = {
  name: 'detect_changes',
  description: 'Show which modules contain uncommitted git changes and which exported symbols are in those files. Useful for understanding the blast radius of current work.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(_args, workspaceRoot) {
    const ctrl = getContextLayerController()
    const repoMap = ctrl?.getRepoMap()
    const repoFacts = ctrl?.getLastRepoFacts()

    if (!repoMap) {
      return 'Context layer not yet built. Try again after the workspace has finished indexing.'
    }

    // Collect changed file paths from repoFacts.gitDiff
    const changedFilePaths = new Set<string>()
    if (repoFacts?.gitDiff?.changedFiles) {
      for (const f of repoFacts.gitDiff.changedFiles) {
        // Normalize to forward slashes and lowercase for matching
        changedFilePaths.add(f.filePath.replace(/\\/g, '/').toLowerCase())
      }
    }

    // Find modules marked as recently changed
    const changedModules = repoMap.modules.filter((e) => e.structural.recentlyChanged)

    if (changedModules.length === 0) {
      return 'No recently changed modules detected. The workspace appears clean.'
    }

    const lines: string[] = [
      `Changed modules (${changedModules.length}):`,
      '',
    ]

    for (const entry of changedModules) {
      const m = entry.structural.module
      lines.push(`${m.id}  (${m.rootPath})`)

      // Find which changed files are in this module's root path
      const moduleRoot = m.rootPath.replace(/\\/g, '/').toLowerCase()
      const moduleChangedFiles = repoFacts?.gitDiff?.changedFiles
        ?.filter((f) => f.filePath.replace(/\\/g, '/').toLowerCase().includes(moduleRoot))
        .map((f) => path.basename(f.filePath)) ?? []

      if (moduleChangedFiles.length > 0) {
        lines.push(`  Changed files: ${moduleChangedFiles.join(', ')}`)
      }

      // Get affected symbols from stored entry
      const stored = await readModuleEntry(workspaceRoot, m.id)
      const symbols = stored?.structural.extractedSymbols ?? []

      if (symbols.length > 0) {
        const symNames = symbols.map((s) => s.name)
        const MAX_SYM = 7
        const shown = symNames.slice(0, MAX_SYM)
        const extra = symNames.length - MAX_SYM
        const symStr = extra > 0 ? `${shown.join(', ')} (+ ${extra} more)` : shown.join(', ')
        lines.push(`  Affected symbols: ${symStr}`)
      }

      lines.push('')
    }

    return truncate(lines.join('\n'))
  },
}

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
    return createGraphMcpTools(graphContext)
  }

  // Fallback: return existing module-level tools
  return ALL_TOOLS
}

/** Look up a tool by name (searches active tools first, then fallback list) */
export function findTool(name: string): McpToolDefinition | undefined {
  return getActiveTools().find((t) => t.name === name)
}
