/**
 * graphController.ts — Main controller for the internal codebase graph engine.
 * Mirrors 14 tools from the codebase-memory MCP server, built natively for the IDE.
 */

import fs from 'fs/promises'
import path from 'path'
import { GraphStore } from './graphStore'
import { GraphQueryEngine } from './graphQuery'
import { parseFile, walkDirectory, resolveEdgeReferences } from './graphParser'
import type {
  GraphToolContext,
  IndexStatus,
  SearchResult,
  CallPathResult,
  ArchitectureView,
  ChangeDetectionResult,
  CodeSnippetResult,
  GraphSchema,
} from './graphTypes'

export class GraphController {
  private store: GraphStore
  private query: GraphQueryEngine
  private rootPath: string
  private projectName: string
  private indexedAt = 0
  private indexDurationMs = 0
  private initialized = false
  private pendingChanges: string[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(rootPath: string) {
    this.rootPath = rootPath
    this.projectName = path.basename(rootPath)
    this.store = new GraphStore(rootPath)
    this.query = new GraphQueryEngine(this.store, rootPath)
  }

  async initialize(): Promise<void> {
    const loaded = await this.store.load()
    if (loaded && this.store.nodeCount() > 0) {
      console.log(`[codebase-graph] Loaded persisted graph: ${this.store.nodeCount()} nodes, ${this.store.edgeCount()} edges`)
      this.initialized = true
      this.indexedAt = Date.now()
      return
    }

    // Full index on first run
    console.log('[codebase-graph] No persisted graph found, performing full index...')
    await this.indexRepository({
      projectRoot: this.rootPath,
      projectName: this.projectName,
      incremental: false,
    })
    this.initialized = true
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    try {
      await this.store.save()
    } catch (err) {
      console.warn('[codebase-graph] Error saving on dispose:', err)
    }
    this.initialized = false
  }

  getStatus(): IndexStatus {
    return {
      initialized: this.initialized,
      projectRoot: this.rootPath,
      projectName: this.projectName,
      nodeCount: this.store.nodeCount(),
      edgeCount: this.store.edgeCount(),
      fileCount: this.store.fileCount(),
      lastIndexedAt: this.indexedAt,
      indexDurationMs: this.indexDurationMs,
    }
  }

  getGraphToolContext(): GraphToolContext {
    return {
      pipeline: {
        index: (options) => this.indexRepository(options),
      },
      projectRoot: this.rootPath,
      projectName: this.projectName,
    }
  }

  // --- Event hooks ---

  onSessionStart(): void {
    this.reindexChangedFiles().catch((err) => {
      console.warn('[codebase-graph] Session-start reindex failed:', err)
    })
  }

  onGitCommit(): void {
    this.reindexChangedFiles().catch((err) => {
      console.warn('[codebase-graph] Git-commit reindex failed:', err)
    })
  }

  onFileChange(paths: string[]): void {
    this.pendingChanges.push(...paths)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.reindexChangedFiles().catch((err) => {
        console.warn('[codebase-graph] Debounced reindex failed:', err)
      })
    }, 2000)
  }

  // --- Tool 1: indexRepository ---
  async indexRepository(opts: {
    projectRoot: string
    projectName: string
    incremental: boolean
  }): Promise<{ success: boolean }> {
    const startTime = Date.now()

    try {
      if (!opts.incremental) {
        this.store.clear()
      }

      const files = await walkDirectory(opts.projectRoot, opts.projectRoot)
      console.log(`[codebase-graph] Found ${files.length} files to index`)

      // Parse all files
      const allNodes = []
      const allEdges = []

      for (const filePath of files) {
        try {
          const result = await parseFile(filePath, opts.projectRoot)
          // Add mtime metadata to file nodes
          try {
            const stat = await fs.stat(filePath)
            for (const node of result.nodes) {
              if (node.type === 'file') {
                node.metadata = { ...node.metadata, mtime: stat.mtimeMs }
              }
            }
          } catch {
            // stat failed, continue without mtime
          }
          allNodes.push(...result.nodes)
          allEdges.push(...result.edges)
        } catch (err) {
          console.warn(`[codebase-graph] Failed to parse ${filePath}:`, err)
        }
      }

      // Resolve cross-file references
      const resolvedEdges = resolveEdgeReferences(allNodes, allEdges)

      // Add to store
      for (const node of allNodes) {
        this.store.addNode(node)
      }
      for (const edge of resolvedEdges) {
        this.store.addEdge(edge)
      }

      this.indexedAt = Date.now()
      this.indexDurationMs = this.indexedAt - startTime

      // Persist
      await this.store.save()

      console.log(
        `[codebase-graph] Indexed ${this.store.nodeCount()} nodes, ${this.store.edgeCount()} edges in ${this.indexDurationMs}ms`
      )

      return { success: true }
    } catch (err) {
      console.error('[codebase-graph] Index failed:', err)
      return { success: false }
    }
  }

  // --- Tool 2: indexStatus ---
  indexStatus(): IndexStatus {
    return this.getStatus()
  }

  // --- Tool 3: listProjects ---
  listProjects(): string[] {
    // Single-project for now
    return this.initialized ? [this.rootPath] : []
  }

  // --- Tool 4: deleteProject ---
  deleteProject(projectRoot: string): { success: boolean } {
    if (projectRoot === this.rootPath) {
      this.store.clear()
      this.initialized = false
      return { success: true }
    }
    return { success: false }
  }

  // --- Tool 5: detectChanges ---
  async detectChanges(): Promise<ChangeDetectionResult> {
    return this.query.detectChanges()
  }

  // --- Tool 6: getArchitecture ---
  getArchitecture(aspects?: string[]): ArchitectureView {
    return this.query.getArchitecture(aspects)
  }

  // --- Tool 7: getCodeSnippet ---
  async getCodeSnippet(symbolId: string): Promise<CodeSnippetResult | null> {
    return this.query.getCodeSnippet(symbolId)
  }

  // --- Tool 8: getGraphSchema ---
  getGraphSchema(): GraphSchema {
    return this.query.getGraphSchema()
  }

  // --- Tool 9: ingestTraces ---
  ingestTraces(traces: unknown[]): { success: boolean; ingested: number } {
    // Ingest external trace data as edges
    let ingested = 0
    if (!Array.isArray(traces)) return { success: false, ingested: 0 }

    for (const trace of traces) {
      if (
        typeof trace === 'object' &&
        trace !== null &&
        'source' in trace &&
        'target' in trace
      ) {
        const t = trace as { source: string; target: string; type?: string }
        this.store.addEdge({
          source: t.source,
          target: t.target,
          type: (t.type as 'calls') ?? 'calls',
        })
        ingested++
      }
    }

    if (ingested > 0) {
      this.store.save().catch((error) => { console.error('[codebase-graph] Failed to save store after trace ingestion:', error) })
    }

    return { success: true, ingested }
  }

  // --- Tool 10: manageAdr ---
  manageAdr(
    action: 'list' | 'get' | 'create' | 'update' | 'delete',
    id?: string,
    content?: string
  ): unknown {
    const adrDir = path.join(this.rootPath, 'docs', 'adr')

    // ADR management is a lightweight file-based system
    switch (action) {
      case 'list':
        return { success: true, adrs: [], message: 'ADR directory: ' + adrDir }
      case 'get':
        return { success: true, id, content: null, message: 'ADR not found' }
      case 'create':
        return { success: true, id, message: 'ADR creation requires file system write — use files:writeFile' }
      case 'update':
        return { success: true, id, message: 'ADR update requires file system write — use files:writeFile' }
      case 'delete':
        return { success: true, id, message: 'ADR deletion requires file system operation' }
      default:
        return { success: false, error: 'Unknown ADR action' }
    }
  }

  // --- Tool 11: queryGraph ---
  queryGraph(query: string): Array<Record<string, unknown>> {
    return this.query.queryGraph(query)
  }

  // --- Tool 12: searchCode ---
  async searchCode(
    pattern: string,
    opts?: { fileGlob?: string; maxResults?: number }
  ): Promise<Array<{ filePath: string; line: number; match: string }>> {
    return this.query.searchCode(pattern, opts)
  }

  // --- Tool 13: searchGraph ---
  searchGraph(query: string, limit?: number): SearchResult[] {
    return this.query.searchGraph(query, limit)
  }

  // --- Tool 14: traceCallPath ---
  traceCallPath(fromId: string, toId: string, maxDepth?: number): CallPathResult {
    return this.query.traceCallPath(fromId, toId, maxDepth)
  }

  // --- Internal: reindex changed files ---
  private async reindexChangedFiles(): Promise<void> {
    const paths = [...new Set(this.pendingChanges)]
    this.pendingChanges = []

    if (paths.length === 0) {
      // Detect changes via filesystem mtime
      const changes = await this.query.detectChanges()
      if (changes.changedFiles.length === 0) return

      for (const relPath of changes.changedFiles) {
        const fullPath = path.join(this.rootPath, relPath)
        await this.reindexSingleFile(fullPath, relPath)
      }
    } else {
      for (const filePath of paths) {
        const relPath = path.relative(this.rootPath, filePath).replace(/\\/g, '/')
        await this.reindexSingleFile(filePath, relPath)
      }
    }

    // Re-resolve edges after reindex
    const allNodes = this.store.getAllNodes()
    const allEdges = this.store.getAllEdges()
    const resolvedEdges = resolveEdgeReferences(allNodes, allEdges)

    // Replace edges with resolved ones
    // We need to clear and re-add since resolveEdgeReferences returns a new array
    this.store.clear()
    for (const node of allNodes) {
      this.store.addNode(node)
    }
    for (const edge of resolvedEdges) {
      this.store.addEdge(edge)
    }

    await this.store.save()
    this.indexedAt = Date.now()
  }

  private async reindexSingleFile(fullPath: string, _relPath: string): Promise<void> {
    // Check if file still exists
    try {
      await fs.access(fullPath)
    } catch {
      // File deleted — just clear it
      const relPath = path.relative(this.rootPath, fullPath).replace(/\\/g, '/')
      this.store.clearFile(relPath)
      return
    }

    const relPath = path.relative(this.rootPath, fullPath).replace(/\\/g, '/')
    this.store.clearFile(relPath)

    try {
      const result = await parseFile(fullPath, this.rootPath)
      // Add mtime
      try {
        const stat = await fs.stat(fullPath)
        for (const node of result.nodes) {
          if (node.type === 'file') {
            node.metadata = { ...node.metadata, mtime: stat.mtimeMs }
          }
        }
      } catch {
        // continue without mtime
      }
      for (const node of result.nodes) {
        this.store.addNode(node)
      }
      for (const edge of result.edges) {
        this.store.addEdge(edge)
      }
    } catch (err) {
      console.warn(`[codebase-graph] Failed to reindex ${fullPath}:`, err)
    }
  }
}

// --- Singleton ---

let instance: GraphController | null = null

export function getGraphController(): GraphController | null {
  return instance
}

export function setGraphController(controller: GraphController): void {
  instance = controller
}
