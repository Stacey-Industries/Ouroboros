/**
 * internalMcpToolsModules.ts — Module-browsing MCP tools.
 * Extracted from internalMcpTools.ts to stay under the 300-line limit.
 */
// Part of the unwired internalMcp module — see index.ts for deprecation notice.

import fs from 'fs/promises'
import path from 'path'

import { readModuleEntry, readRepoMap } from '../contextLayer/contextLayerStore'
import {
  appendAiSection,
  appendDepsSection,
  appendSymbolsSection,
} from './internalMcpToolsHelpers'
import type { McpToolDefinition } from './internalMcpTypes'

// ---------------------------------------------------------------------------
// Constants (shared with graph tools via re-export)
// ---------------------------------------------------------------------------

export const MAX_RESPONSE_CHARS = 8000
export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h'])

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export function validateModuleId(moduleId: unknown): string {
  if (typeof moduleId !== 'string' || moduleId.length === 0) {
    throw new Error('moduleId must be a non-empty string')
  }
  if (moduleId.includes('..') || path.isAbsolute(moduleId) || moduleId.includes('\\')) {
    throw new Error('moduleId contains invalid path characters')
  }
  return moduleId
}

export function truncate(text: string): string {
  if (text.length <= MAX_RESPONSE_CHARS) return text
  return text.slice(0, MAX_RESPONSE_CHARS) + '\n\n[Response truncated to 8000 chars]'
}

// ---------------------------------------------------------------------------
// Recursive directory listing filtered by source extensions
// ---------------------------------------------------------------------------

async function walkDir(current: string, workspaceRoot: string, results: string[]): Promise<void> {
  let entries
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath validated against workspaceRoot + moduleId path chars
    entries = await fs.readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walkDir(fullPath, workspaceRoot, results)
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext)) {
        results.push(path.relative(workspaceRoot, fullPath).replace(/\\/g, '/'))
      }
    }
  }
}

export async function listSourceFiles(dirPath: string, workspaceRoot: string): Promise<string[]> {
  const results: string[] = []
  await walkDir(dirPath, workspaceRoot, results)
  return results.sort()
}

// ---------------------------------------------------------------------------
// Tool: search_modules
// ---------------------------------------------------------------------------

export const searchModulesTool: McpToolDefinition = {
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
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const matches = repoMap.modules.filter((entry) => {
      const m = entry.structural.module
      return (
        m.id.toLowerCase().includes(query) ||
        m.label.toLowerCase().includes(query) ||
        m.rootPath.toLowerCase().includes(query)
      )
    }).slice(0, limit)

    if (matches.length === 0) return `No modules found matching "${args.query}".`

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

export const getModuleTool: McpToolDefinition = {
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
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const repoEntry = repoMap.modules.find((e) => e.structural.module.id === moduleId)
    if (!repoEntry) return `Module "${moduleId}" not found. Use list_modules to see available modules.`

    const entry = await readModuleEntry(workspaceRoot, moduleId)
    if (!entry) return `Module "${moduleId}" found in repo map but details not available yet.`

    const s = entry.structural
    const m = s.module
    const lines: string[] = [
      `# Module: ${m.label} (${m.id})`,
      `Path:    ${m.rootPath}`,
      `Pattern: ${m.pattern}`,
      `Files:   ${s.fileCount} | Lines: ${s.totalLines}`,
      `Languages: ${s.languages.join(', ') || 'unknown'}`,
      `Recently changed: ${s.recentlyChanged ? 'yes' : 'no'}`,
      '',
    ]
    appendAiSection(entry, lines)
    appendSymbolsSection(entry, lines)
    appendDepsSection(moduleId, repoMap, lines)
    return truncate(lines.join('\n'))
  },
}

// ---------------------------------------------------------------------------
// Tool: list_modules
// ---------------------------------------------------------------------------

export const listModulesTool: McpToolDefinition = {
  name: 'list_modules',
  description: 'List all modules in the codebase with brief descriptions. Use this to orient yourself before diving into specific modules.',
  inputSchema: {
    type: 'object',
    properties: {
      includeDescriptions: { type: 'boolean', description: 'Include AI descriptions (default true)' },
    },
  },
  async handler(args, workspaceRoot) {
    const includeDescriptions = args.includeDescriptions !== false

    const repoMap = await readRepoMap(workspaceRoot)
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const lines: string[] = [
      `Project: ${repoMap.projectName}`,
      `Modules: ${repoMap.moduleCount} | Files: ${repoMap.totalFileCount}`,
      `Languages: ${repoMap.languages.join(', ')}`,
      `Frameworks: ${repoMap.frameworks.join(', ')}`,
      '',
    ]

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
// Tool: get_module_files
// ---------------------------------------------------------------------------

export const getModuleFilesTool: McpToolDefinition = {
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
    if (!repoMap) return 'Context layer not yet built. Try again after the workspace has finished indexing.'

    const repoEntry = repoMap.modules.find((e) => e.structural.module.id === moduleId)
    if (!repoEntry) return `Module "${moduleId}" not found. Use list_modules to see available modules.`

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
      for (const f of files) lines.push(`  ${f}`)
    }

    return truncate(lines.join('\n'))
  },
}
