/**
 * internalMcpToolsHelpers.ts — Formatting helpers for MCP tool handlers.
 * Extracted from internalMcpTools.ts to stay under the 300-line limit.
 */

import type { ModuleContextEntry, RepoMap } from '../contextLayer/contextLayerTypes'

// ---------------------------------------------------------------------------
// Shared line-builder helpers
// ---------------------------------------------------------------------------

export function appendAiSection(entry: ModuleContextEntry, lines: string[]): void {
  if (entry.ai) {
    lines.push('## AI Summary')
    lines.push(entry.ai.description)
    lines.push('')
    if (entry.ai.keyResponsibilities.length > 0) {
      lines.push('## Key Responsibilities')
      for (const r of entry.ai.keyResponsibilities) lines.push(`- ${r}`)
      lines.push('')
    }
    if (entry.ai.gotchas.length > 0) {
      lines.push('## Gotchas')
      for (const g of entry.ai.gotchas) lines.push(`- ${g}`)
      lines.push('')
    }
  } else {
    lines.push('## AI Summary')
    lines.push('(not yet generated)')
    lines.push('')
  }
}

export function appendSymbolsSection(entry: ModuleContextEntry, lines: string[]): void {
  const s = entry.structural
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
}

export function appendDepsSection(moduleId: string, repoMap: RepoMap, lines: string[]): void {
  const deps = repoMap.crossModuleDependencies.filter((d) => d.from === moduleId)
  if (deps.length > 0) {
    lines.push('## Dependencies (this module imports)')
    for (const dep of deps) lines.push(`- ${dep.to} (weight: ${dep.weight})`)
    lines.push('')
  }
  const callers = repoMap.crossModuleDependencies.filter((d) => d.to === moduleId)
  if (callers.length > 0) {
    lines.push('## Used by')
    for (const c of callers) lines.push(`- ${c.from} (weight: ${c.weight})`)
    lines.push('')
  }
}

// ---------------------------------------------------------------------------
// Architecture overview formatter
// ---------------------------------------------------------------------------

export function appendModuleGroup(label: string, modules: RepoMap['modules'], lines: string[]): void {
  if (modules.length === 0) return
  lines.push(`## ${label} (${modules.length})`)
  for (const entry of modules) {
    const m = entry.structural.module
    lines.push(`  ${m.id}  [${m.rootPath}]  ${entry.structural.fileCount} files`)
  }
  lines.push('')
}

export function formatArchitectureBody(repoMap: RepoMap): string[] {
  const lines: string[] = []
  lines.push(`# Architecture: ${repoMap.projectName}`)
  lines.push(`Generated: ${repoMap.generatedAt ? new Date(repoMap.generatedAt).toISOString() : 'unknown'}`)
  lines.push('')
  lines.push('## Overview')
  lines.push(`Modules:    ${repoMap.moduleCount}`)
  lines.push(`Total files: ${repoMap.totalFileCount}`)
  lines.push(`Languages:  ${repoMap.languages.join(', ')}`)
  lines.push(`Frameworks: ${repoMap.frameworks.join(', ')}`)
  lines.push('')
  appendModuleGroup('Main Process', repoMap.modules.filter((e) => e.structural.module.rootPath.startsWith('src/main')), lines)
  appendModuleGroup('Preload', repoMap.modules.filter((e) => e.structural.module.rootPath.startsWith('src/preload')), lines)
  appendModuleGroup('Renderer', repoMap.modules.filter((e) => e.structural.module.rootPath.startsWith('src/renderer')), lines)
  appendModuleGroup('Other', repoMap.modules.filter((e) =>
    !e.structural.module.rootPath.startsWith('src/main') &&
    !e.structural.module.rootPath.startsWith('src/preload') &&
    !e.structural.module.rootPath.startsWith('src/renderer'),
  ), lines)
  if (repoMap.crossModuleDependencies.length > 0) {
    lines.push('## Cross-Module Dependencies')
    const sorted = [...repoMap.crossModuleDependencies].sort((a, b) => b.weight - a.weight)
    for (const dep of sorted) lines.push(`  ${dep.from} → ${dep.to} (weight: ${dep.weight})`)
    lines.push('')
  }
  return lines
}

// ---------------------------------------------------------------------------
// Symbol search formatters
// ---------------------------------------------------------------------------

export interface SymbolResult {
  name: string
  kind: string
  moduleId: string
  signature?: string
  filePath?: string
  line?: number
}

export function formatSymbolSearchResults(query: string, kindFilter: string | null, moduleIdFilter: string | null, results: SymbolResult[]): string {
  if (results.length === 0) {
    const kindSuffix = kindFilter ? ` (kind: ${kindFilter})` : ''
    const modSuffix = moduleIdFilter ? ` (module: ${moduleIdFilter})` : ''
    return `No symbols found matching "${query}"${kindSuffix}${modSuffix}.`
  }
  const lines: string[] = [`Found ${results.length} symbol(s) matching "${query}":\n`]
  for (const sym of results) {
    const loc = sym.filePath ? `${sym.filePath}:${sym.line ?? 0}` : `${sym.moduleId}:${sym.line ?? 0}`
    lines.push(`[${sym.kind}] ${sym.name}  (${sym.moduleId} — ${loc})`)
    if (sym.signature) lines.push(`  signature: ${sym.signature}`)
  }
  return lines.join('\n')
}

export function formatSymbolDetail(results: SymbolResult[]): string {
  if (results.length === 0) return ''
  const lines: string[] = []
  for (const sym of results) {
    const loc = sym.filePath ? `${sym.filePath}:${sym.line ?? 0}` : `line ${sym.line ?? 0}`
    lines.push(`# ${sym.name}`)
    lines.push(`Kind:    ${sym.kind}`)
    lines.push(`Module:  ${sym.moduleId}`)
    lines.push(`File:    ${loc}`)
    if (sym.signature) lines.push(`Signature: ${sym.signature}`)
    lines.push('')
  }
  if (results.length === 5) lines.push('(showing first 5 matches — use moduleId to narrow results)')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Import graph formatter
// ---------------------------------------------------------------------------

export function formatImportGraphLines(moduleId: string, repoMap: RepoMap, direction: string): string[] {
  const lines: string[] = [
    `# Import graph for: ${moduleId}`,
    '(Note: edges represent file-level imports, not function-call relationships)',
    '',
  ]
  if (direction === 'imports' || direction === 'both') {
    const imports = repoMap.crossModuleDependencies.filter((d) => d.from === moduleId).sort((a, b) => b.weight - a.weight)
    lines.push(`## ${moduleId} imports:`)
    if (imports.length === 0) { lines.push('  (no cross-module imports)') }
    else { for (const dep of imports) lines.push(`  → ${dep.to} (weight: ${dep.weight})`) }
    lines.push('')
  }
  if (direction === 'imported_by' || direction === 'both') {
    const importedBy = repoMap.crossModuleDependencies.filter((d) => d.to === moduleId).sort((a, b) => b.weight - a.weight)
    lines.push(`## ${moduleId} is imported by:`)
    if (importedBy.length === 0) { lines.push('  (no modules import this module)') }
    else { for (const dep of importedBy) lines.push(`  ← ${dep.from} (weight: ${dep.weight})`) }
    lines.push('')
  }
  return lines
}

// ---------------------------------------------------------------------------
// detect_changes helpers
// ---------------------------------------------------------------------------

export interface GitChangedFile {
  filePath: string
  additions: number
  deletions: number
  status: string
}

export function filterChangedFilesForModule(
  changedFiles: Array<{ filePath: string; additions?: number; deletions?: number; status?: string }> | undefined,
  moduleRoot: string,
): ChangedFileInfo[] {
  return changedFiles
    ?.filter((f) => f.filePath.replace(/\\/g, '/').toLowerCase().includes(moduleRoot))
    .map((f) => ({ filePath: f.filePath, additions: f.additions ?? 0, deletions: f.deletions ?? 0, status: f.status ?? 'M' })) ?? []
}

// ---------------------------------------------------------------------------
// detect_changes formatter
// ---------------------------------------------------------------------------

export interface ChangedFileInfo {
  filePath: string
  additions: number
  deletions: number
  status: string
}

export function formatChangedModuleLines(
  entry: RepoMap['modules'][number],
  changedFilesForModule: ChangedFileInfo[],
  symbols: Array<{ name: string }>,
  lines: string[],
): void {
  const m = entry.structural.module
  lines.push(`${m.id}  (${m.rootPath})`)
  if (changedFilesForModule.length > 0) {
    const fileNames = changedFilesForModule.map((f) => {
      const parts = f.filePath.replace(/\\/g, '/').split('/')
      return parts[parts.length - 1] ?? f.filePath
    })
    lines.push(`  Changed files: ${fileNames.join(', ')}`)
  }
  if (symbols.length > 0) {
    const MAX_SYM = 7
    const symNames = symbols.map((s) => s.name)
    const shown = symNames.slice(0, MAX_SYM)
    const extra = symNames.length - MAX_SYM
    const symStr = extra > 0 ? `${shown.join(', ')} (+ ${extra} more)` : shown.join(', ')
    lines.push(`  Affected symbols: ${symStr}`)
  }
  lines.push('')
}
