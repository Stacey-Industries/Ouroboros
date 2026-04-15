/**
 * graphDatabase.ts — SQLite property graph store backed by better-sqlite3.
 *
 * Manages the lifecycle of the database, schema creation, and CRUD operations
 * for nodes and edges. All operations are synchronous (better-sqlite3's design).
 */

import { xxh3 } from '@node-rs/xxhash'
import Database from 'better-sqlite3'

import type { ChangedSymbol, ChangedSymbolsForSession } from './detectChangesForSessionTypes'
import {
  aggregateEdgeTypeCounts,
  aggregateNodeLabelCounts,
  type BfsOptions,
  buildCoreStatements,
  buildHashAndProjectStatements,
  buildSearchAndStatsStatements,
  getDbPath,
  type NodesByDegreeOptions,
  rowToAdr,
  rowToEdge,
  rowToFileHash,
  rowToNode,
  rowToProject,
  runBfsTraversal,
  runGetNodesByDegree,
  runNodeDegreeQuery,
  runSearchNodes,
  SCHEMA_SQL,
} from './graphDatabaseHelpers'
import { SCHEMA_VERSION } from './graphDatabaseSchema'
import type {
  ADRRecord,
  EdgeType,
  FileHashRecord,
  GraphEdge,
  GraphNode,
  NodeFilter,
  NodeLabel,
  NodeSearchResult,
  ProjectRecord,
} from './graphDatabaseTypes'

// ─── GraphDatabase class ─────────────────────────────────────────────────────

export class GraphDatabase {
  private db: Database.Database
  private stmts!: Record<string, Database.Statement>

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? getDbPath())
    this.applyPragmas()
    this.createSchema()
    this.prepareStatements()
  }

  private applyPragmas(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -32000')
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('mmap_size = 134217728')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
  }

  private createSchema(): void {
    this.db.exec(SCHEMA_SQL)
    this.runMigrations()
  }

  private runMigrations(): void {
    const current = (this.db.pragma('user_version', { simple: true }) as number) ?? 0
    if (current >= SCHEMA_VERSION) return
    const txn = this.db.transaction(() => {
      if (current < 1) this.migrateToV1()
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
    })
    txn()
  }

  private migrateToV1(): void {
    const cols = this.db.pragma('table_info(projects)') as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'last_opened_at')) {
      this.db.exec('ALTER TABLE projects ADD COLUMN last_opened_at INTEGER NOT NULL DEFAULT 0')
    }
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS graph_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT',
    )
  }

  private prepareStatements(): void {
    this.stmts = {
      ...buildCoreStatements(this.db),
      ...buildHashAndProjectStatements(this.db),
      ...buildSearchAndStatsStatements(this.db),
    }
  }


  // ─── Project operations ─────────────────────────────────────────────────

  upsertProject(project: ProjectRecord): void { this.stmts.upsertProject.run(project) }

  getProject(name: string): ProjectRecord | null {
    const row = this.stmts.getProject.get(name)
    return row ? rowToProject(row as Record<string, unknown>) : null
  }

  listProjects(): ProjectRecord[] {
    return (this.stmts.listProjects.all() as Record<string, unknown>[]).map(rowToProject)
  }

  deleteProject(name: string): void { this.stmts.deleteProject.run(name) }

  touchProjectOpened(name: string): void {
    this.db.prepare('UPDATE projects SET last_opened_at = ? WHERE name = ?').run(Date.now(), name)
  }

  getProjectLastOpened(name: string): number | null {
    const row = this.db.prepare('SELECT last_opened_at FROM projects WHERE name = ?').get(name) as { last_opened_at: number } | undefined
    return row ? row.last_opened_at : null
  }

  listAllProjects(): { name: string; last_opened_at: number }[] {
    return this.db.prepare('SELECT name, last_opened_at FROM projects ORDER BY name').all() as { name: string; last_opened_at: number }[]
  }

  // ─── Node operations ───────────────────────────────────────────────────

  insertNode(node: GraphNode): void {
    this.stmts.insertNode.run({
      id: node.id, project: node.project, label: node.label,
      name: node.name, qualified_name: node.qualified_name,
      file_path: node.file_path, start_line: node.start_line,
      end_line: node.end_line, props: JSON.stringify(node.props),
    })
  }

  insertNodes(nodes: GraphNode[]): void {
    this.transaction(() => { for (const node of nodes) this.insertNode(node) })
  }

  getNode(id: string): GraphNode | null {
    const row = this.stmts.getNode.get(id)
    return row ? rowToNode(row) : null
  }

  getNodesByLabel(project: string, label: NodeLabel): GraphNode[] {
    return this.stmts.getNodesByLabel.all(project, label).map((r) => rowToNode(r))
  }

  getNodesByFile(project: string, filePath: string): GraphNode[] {
    return this.stmts.getNodesByFile.all(project, filePath).map((r) => rowToNode(r))
  }

  deleteNodesByProject(project: string): void { this.stmts.deleteNodesByProject.run(project) }
  deleteNodesByFile(project: string, filePath: string): void {
    this.stmts.deleteNodesByFile.run(project, filePath)
  }

  /**
   * Delete all nodes for a project whose file_path contains the given substring.
   * Used by the GC pass to bulk-evict nodes matching skip rules (e.g. worktree paths).
   * Returns the count of deleted nodes.
   */
  deleteNodesByFilePathSubstring(project: string, substring: string): number {
    const result = this.db
      .prepare("DELETE FROM nodes WHERE project = ? AND file_path LIKE ? ESCAPE '\\'")
      .run(project, `%${substring.replace(/[%_\\]/g, '\\$&')}%`)
    return result.changes
  }

  updateNodeProps(id: string, props: Record<string, unknown>): void {
    this.stmts.updateNodeProps.run({ id, props: JSON.stringify(props) })
  }

  // ─── Edge operations ───────────────────────────────────────────────────

  insertEdge(edge: Omit<GraphEdge, 'id'>): void {
    this.stmts.insertEdge.run({
      project: edge.project, source_id: edge.source_id,
      target_id: edge.target_id, type: edge.type,
      props: JSON.stringify(edge.props),
    })
  }

  insertEdges(edges: Omit<GraphEdge, 'id'>[]): void {
    this.transaction(() => { for (const edge of edges) this.insertEdge(edge) })
  }

  getOutboundEdges(nodeId: string, type?: EdgeType): GraphEdge[] {
    const rows = type
      ? this.stmts.getEdgesBySourceAndType.all(nodeId, type)
      : this.stmts.getEdgesBySource.all(nodeId)
    return rows.map((r) => rowToEdge(r))
  }

  getInboundEdges(nodeId: string, type?: EdgeType): GraphEdge[] {
    const rows = type
      ? this.stmts.getEdgesByTargetAndType.all(nodeId, type)
      : this.stmts.getEdgesByTarget.all(nodeId)
    return rows.map((r) => rowToEdge(r))
  }

  deleteEdgesByProject(project: string): void { this.stmts.deleteEdgesByProject.run(project) }

  // ─── Search ────────────────────────────────────────────────────────────

  searchNodes(filter: NodeFilter): NodeSearchResult {
    return runSearchNodes(this.db, filter, (r) => rowToNode(r))
  }

  searchNodesFts(query: string, limit: number = 100): GraphNode[] {
    return this.stmts.searchNodesFts.all(query, limit).map((r) => rowToNode(r))
  }

  // ─── File hash tracking ─────────────────────────────────────────────────

  upsertFileHash(record: FileHashRecord): void { this.stmts.upsertFileHash.run(record) }

  getFileHash(project: string, relPath: string): FileHashRecord | null {
    const row = this.stmts.getFileHash.get(project, relPath)
    return row ? rowToFileHash(row as Record<string, unknown>) : null
  }

  getAllFileHashes(project: string): FileHashRecord[] {
    return (this.stmts.getAllFileHashes.all(project) as Record<string, unknown>[]).map(rowToFileHash)
  }

  deleteFileHashes(project: string): void { this.stmts.deleteFileHashes.run(project) }
  deleteFileHash(project: string, relPath: string): void {
    this.stmts.deleteFileHash.run(project, relPath)
  }

  // ─── ADR ────────────────────────────────────────────────────────────────

  upsertAdr(record: ADRRecord): void { this.stmts.upsertAdr.run(record) }

  getAdr(project: string): ADRRecord | null {
    const row = this.stmts.getAdr.get(project)
    return row ? rowToAdr(row as Record<string, unknown>) : null
  }

  deleteAdr(project: string): void { this.stmts.deleteAdr.run(project) }

  listAdrs(): ADRRecord[] {
    return (this.db.prepare('SELECT * FROM project_summaries ORDER BY project').all() as Record<string, unknown>[]).map(rowToAdr)
  }

  // ─── Statistics ─────────────────────────────────────────────────────────

  getNodeCount(project: string): number {
    const row = this.stmts.countNodes.get(project) as { count: number }
    return row.count
  }

  getEdgeCount(project: string): number {
    const row = this.stmts.countEdges.get(project) as { count: number }
    return row.count
  }

  getNodeLabelCounts(project: string): Record<NodeLabel, number> {
    return aggregateNodeLabelCounts(
      this.stmts.getNodeLabelCounts.all(project) as Array<{ label: string; count: number }>,
    )
  }

  getEdgeTypeCounts(project: string): Record<EdgeType, number> {
    return aggregateEdgeTypeCounts(
      this.stmts.getEdgeTypeCounts.all(project) as Array<{ type: string; count: number }>,
    )
  }

  getRelationshipPatterns(project: string): string[] {
    const rows = this.stmts.getRelationshipPatterns.all(project) as Array<{ pattern: string }>
    return rows.map((r) => r.pattern)
  }

  // ─── Degree queries ─────────────────────────────────────────────────────

  getNodeDegree(nodeId: string, type?: EdgeType, direction: 'in' | 'out' | 'both' = 'both'): number {
    return runNodeDegreeQuery(this.db, nodeId, type, direction)
  }

  getNodesByDegree(project: string, options: NodesByDegreeOptions): NodeSearchResult {
    return runGetNodesByDegree(this.db, project, options, (r) => rowToNode(r))
  }

  // ─── Graph traversal (BFS via recursive CTE) ───────────────────────────

  bfsTraversal(options: BfsOptions & { maxNodes?: number }): Array<{ id: string; depth: number; path: string[] }> {
    return runBfsTraversal(this.db, { ...options, maxNodes: options.maxNodes ?? 200 })
  }

  // ─── Raw query (read-only) ──────────────────────────────────────────────

  rawQuery(sql: string, params: unknown[] = []): unknown[] {
    return this.db.prepare(sql).all(...params)
  }

  // ─── Bulk operations (transactional) ────────────────────────────────────

  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn)
    return txn()
  }

  // ─── Graph metadata ──────────────────────────────────────────────────────

  setGraphMetadata(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)').run(key, value)
  }

  getGraphMetadata(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM graph_metadata WHERE key = ?').get(key) as { value: string } | undefined
    return row ? row.value : null
  }

  // ─── GC / catalog hash ──────────────────────────────────────────────────────

  pruneProject(projectName: string): { nodes: number; edges: number } {
    const nodes = (this.db.prepare('SELECT COUNT(*) as n FROM nodes WHERE project = ?').get(projectName) as { n: number }).n
    const edges = (this.db.prepare('SELECT COUNT(*) as n FROM edges WHERE project = ?').get(projectName) as { n: number }).n
    this.db.prepare('DELETE FROM file_hashes WHERE project = ?').run(projectName)
    this.db.prepare('DELETE FROM projects WHERE name = ?').run(projectName)
    return { nodes, edges }
  }

  writeCatalogHash(projectName: string): void {
    const rows = this.db
      .prepare('SELECT rel_path, content_hash FROM file_hashes WHERE project = ? ORDER BY rel_path')
      .all(projectName) as Array<{ rel_path: string; content_hash: string }>
    const payload = rows.map((r) => `${r.rel_path}\x00${r.content_hash}`).join('\n')
    const hash = xxh3.xxh128(Buffer.from(payload)).toString(16).padStart(32, '0')
    this.setGraphMetadata(`catalog_hash:${projectName}`, hash)
  }

  verifyCatalogHash(projectName: string): boolean {
    const stored = this.getGraphMetadata(`catalog_hash:${projectName}`)
    if (!stored) return true
    const rows = this.db
      .prepare('SELECT rel_path, content_hash FROM file_hashes WHERE project = ? ORDER BY rel_path')
      .all(projectName) as Array<{ rel_path: string; content_hash: string }>
    const payload = rows.map((r) => `${r.rel_path}\x00${r.content_hash}`).join('\n')
    const hash = xxh3.xxh128(Buffer.from(payload)).toString(16).padStart(32, '0')
    return hash === stored
  }

  // ─── Session-scoped change detection ─────────────────────────────────────

  detectChangesForSession(projectName: string, sessionFiles: string[]): ChangedSymbolsForSession {
    const changedFiles = sessionFiles.filter((f) => this.isFileChanged(projectName, f))
    const directIds = new Set<string>()
    for (const f of changedFiles) {
      for (const n of this.getNodesByFile(projectName, f)) directIds.add(n.id)
    }
    const affected = this.expandCallers(directIds, 2)
    return { projectName, changedFiles, affectedSymbols: Array.from(affected.values()), blastRadius: affected.size }
  }

  private isFileChanged(project: string, relPath: string): boolean {
    const stored = this.getFileHash(project, relPath)
    if (!stored) return true
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs')
       
      const stat = fs.statSync(relPath)
      return stat.mtimeMs * 1e6 > stored.mtime_ns
    } catch { return true }
  }

  private collectInboundNeighbours(id: string, next: Set<string>): void {
    for (const e of this.getInboundEdges(id)) next.add(e.source_id)
  }

  private expandCallers(seedIds: Set<string>, maxHops: number): Map<string, ChangedSymbol> {
    const result = new Map<string, ChangedSymbol>()
    let frontier = seedIds
    for (let hop = 0; hop <= maxHops; hop++) {
      const next = new Set<string>()
      for (const id of frontier) {
        if (result.has(id)) continue
        const node = this.getNode(id)
        if (!node) continue
        result.set(id, { id: node.id, name: node.name, label: node.label, filePath: node.file_path, startLine: node.start_line, hopDepth: hop })
        if (hop < maxHops) this.collectInboundNeighbours(id, next)
      }
      frontier = next
      if (frontier.size === 0) break
    }
    return result
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  close(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    this.db.close()
  }
}
