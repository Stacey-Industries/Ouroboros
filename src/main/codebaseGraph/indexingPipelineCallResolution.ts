/**
 * indexingPipelineCallResolution.ts — Call resolution pass helpers extracted
 * from indexingPipeline.ts to stay under the 300-line limit.
 *
 * Resolves function call sites to their definitions by cross-referencing
 * the file's import map and the global symbols-by-name index.
 */

import type { GraphDatabase } from './graphDatabase'
import type { GraphEdge } from './graphDatabaseTypes'
import type { IndexedFile } from './indexingPipelineTypes'

// ─── Call resolution context types ───────────────────────────────────────────

interface CallResolutionContext {
  projectName: string
  symbolsByName: Map<string, string[]>
  fileImportMap: Map<string, Map<string, string>>
}

interface FileCallContext {
  importedNames: Map<string, string>
  fileDefs: { name: string }[]
  fileQn: string
}

// ─── Import specifier resolution ──────────────────────────────────────────────

function resolveImportSpecifier(
  _specName: string,
  candidates: string[],
  impSource: string,
): string | null {
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    const fromFile = impSource.replace(/^\.\//, '').replace(/\.[^.]+$/, '')
    return candidates.find((c) => c.includes(fromFile.replace(/\//g, '.'))) ?? null
  }
  return null
}

function resolveFileImports(
  file: IndexedFile,
  symbolsByName: Map<string, string[]>,
): Map<string, string> {
  const importedNames = new Map<string, string>()
  if (!file.parsed) return importedNames

  for (const imp of file.parsed.imports) {
    if (imp.isTypeOnly) continue
    for (const spec of imp.specifiers) {
      const candidates = symbolsByName.get(spec.originalName ?? spec.name) ?? []
      const resolved = resolveImportSpecifier(spec.name, candidates, imp.source)
      if (resolved) importedNames.set(spec.name, resolved)
    }
  }
  return importedNames
}

function buildFileImportMap(
  indexedFiles: IndexedFile[],
  projectName: string,
  symbolsByName: Map<string, string[]>,
): Map<string, Map<string, string>> {
  const fileImportMap = new Map<string, Map<string, string>>()
  for (const file of indexedFiles) {
    if (!file.parsed) continue
    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    fileImportMap.set(fileQn, resolveFileImports(file, symbolsByName))
  }
  return fileImportMap
}

// ─── Callee resolution ────────────────────────────────────────────────────────

function resolveCallee(
  calleeName: string,
  fileCtx: FileCallContext,
  ctx: CallResolutionContext,
): string | null {
  if (fileCtx.importedNames.has(calleeName)) return fileCtx.importedNames.get(calleeName)!
  const sameFileDef = fileCtx.fileDefs.find((d) => d.name === calleeName)
  if (sameFileDef) return `${fileCtx.fileQn}.${sameFileDef.name}`
  const candidates = ctx.symbolsByName.get(calleeName) ?? []
  if (candidates.length === 1) return candidates[0]
  return null
}

function resolveCallEdges(
  indexedFiles: IndexedFile[],
  ctx: CallResolutionContext,
  edges: Omit<GraphEdge, 'id'>[],
): void {
  for (const file of indexedFiles) {
    if (!file.parsed) continue
    const fileQn = `${ctx.projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    const importedNames = ctx.fileImportMap.get(fileQn) ?? new Map()
    const fileDefs = file.parsed.definitions.filter((d) => d.kind === 'Function' || d.kind === 'Method')
    const fileCtx: FileCallContext = { importedNames, fileDefs, fileQn }

    for (const call of file.parsed.calls) {
      const enclosingDef = fileDefs.find((d) => call.startLine >= d.startLine && call.startLine <= d.endLine)
      if (!enclosingDef) continue
      const callerQn = `${fileQn}.${enclosingDef.name}`
      const calleeQn = resolveCallee(call.calleeName, fileCtx, ctx)
      if (calleeQn && calleeQn !== callerQn) {
        edges.push({
          project: ctx.projectName, source_id: callerQn, target_id: calleeQn,
          type: call.isAsync ? 'ASYNC_CALLS' : 'CALLS', props: {},
        })
      }
    }
  }
}

// ─── Chunk helper ────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// ─── Public: Call Resolution Pass ────────────────────────────────────────────

function buildSymbolsByName(db: GraphDatabase, projectName: string): Map<string, string[]> {
  const symbolsByName = new Map<string, string[]>()
  const allDefinitions = db.getNodesByLabel(projectName, 'Function')
    .concat(db.getNodesByLabel(projectName, 'Method'))
  for (const node of allDefinitions) {
    const names = symbolsByName.get(node.name) ?? []
    names.push(node.id)
    symbolsByName.set(node.name, names)
  }
  return symbolsByName
}

function deduplicateEdges(edges: Omit<GraphEdge, 'id'>[]): Omit<GraphEdge, 'id'>[] {
  const seen = new Set<string>()
  return edges.filter((e) => {
    const key = `${e.source_id}|${e.target_id}|${e.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function resolveChunkEdges(
  files: IndexedFile[],
  callCtx: CallResolutionContext,
): Omit<GraphEdge, 'id'>[] {
  const edges: Omit<GraphEdge, 'id'>[] = []
  resolveCallEdges(files, callCtx, edges)
  return deduplicateEdges(edges)
}

export function callResolutionPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
  options?: { chunkSize?: number },
): void {
  const symbolsByName = buildSymbolsByName(db, projectName)
  const fileImportMap = buildFileImportMap(indexedFiles, projectName, symbolsByName)
  const callCtx: CallResolutionContext = { projectName, symbolsByName, fileImportMap }
  const size = options?.chunkSize
  if (!size) {
    db.insertEdges(resolveChunkEdges(indexedFiles, callCtx))
    return
  }
  for (const chunk of chunkArray(indexedFiles, size)) {
    db.transaction(() => db.insertEdges(resolveChunkEdges(chunk, callCtx)))
  }
}
