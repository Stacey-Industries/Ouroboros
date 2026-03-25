/**
 * graphDatabase.ts — SQLite property graph store backed by better-sqlite3.
 *
 * Manages the lifecycle of the database, schema creation, and CRUD operations
 * for nodes and edges. All operations are synchronous (better-sqlite3's design).
 */

import Database from 'better-sqlite3'
import path from 'path'
import type {
  GraphNode,
  GraphEdge,
  NodeLabel,
  EdgeType,
  NodeFilter,
  NodeSearchResult,
  FileHashRecord,
  ProjectRecord,
  ADRRecord,
} from './graphDatabaseTypes'

// ─── Database path ───────────────────────────────────────────────────────────

function getDbPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    return path.join(app.getPath('userData'), 'codebase-graph.db')
  } catch {
    // Fallback for testing context where electron is not available
    return path.join(process.cwd(), 'codebase-graph.db')
  }
}

// ─── SQL Schema ──────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
-- Core graph tables

CREATE TABLE IF NOT EXISTS projects (
  name       TEXT PRIMARY KEY,
  root_path  TEXT NOT NULL,
  indexed_at INTEGER NOT NULL DEFAULT 0,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nodes (
  id             TEXT PRIMARY KEY,
  project        TEXT NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  name           TEXT NOT NULL,
  qualified_name TEXT NOT NULL UNIQUE,
  file_path      TEXT,
  start_line     INTEGER,
  end_line       INTEGER,
  props          TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project);
CREATE INDEX IF NOT EXISTS idx_nodes_label   ON nodes(label);
CREATE INDEX IF NOT EXISTS idx_nodes_name    ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_file    ON nodes(file_path);

CREATE TABLE IF NOT EXISTS edges (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  project   TEXT NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,
  props     TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source_id, target_id, type)
);

CREATE INDEX IF NOT EXISTS idx_edges_source  ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target  ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type    ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_project ON edges(project);

-- File hash tracking (incremental reindex)

CREATE TABLE IF NOT EXISTS file_hashes (
  project      TEXT NOT NULL,
  rel_path     TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  mtime_ns     INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  PRIMARY KEY (project, rel_path)
);

-- ADR storage

CREATE TABLE IF NOT EXISTS project_summaries (
  project     TEXT PRIMARY KEY REFERENCES projects(name) ON DELETE CASCADE,
  summary     TEXT NOT NULL DEFAULT '{}',
  source_hash TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0
);

-- FTS5 index for symbol search

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  name,
  qualified_name,
  file_path,
  content='nodes',
  content_rowid='rowid',
  tokenize='trigram'
);

-- Triggers to keep FTS in sync

CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, name, qualified_name, file_path)
  VALUES (new.rowid, new.name, new.qualified_name, new.file_path);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name, file_path)
  VALUES ('delete', old.rowid, old.name, old.qualified_name, old.file_path);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name, file_path)
  VALUES ('delete', old.rowid, old.name, old.qualified_name, old.file_path);
  INSERT INTO nodes_fts(rowid, name, qualified_name, file_path)
  VALUES (new.rowid, new.name, new.qualified_name, new.file_path);
END;
`

// ─── Prepared Statement Types ────────────────────────────────────────────────

interface PreparedStatements {
  insertNode: Database.Statement
  insertEdge: Database.Statement
  deleteNode: Database.Statement
  deleteEdge: Database.Statement
  getNode: Database.Statement
  getEdgesBySource: Database.Statement
  getEdgesBySourceAndType: Database.Statement
  getEdgesByTarget: Database.Statement
  getEdgesByTargetAndType: Database.Statement
  upsertFileHash: Database.Statement
  getFileHash: Database.Statement
  getAllFileHashes: Database.Statement
  deleteFileHashes: Database.Statement
  deleteFileHash: Database.Statement
  upsertProject: Database.Statement
  getProject: Database.Statement
  listProjects: Database.Statement
  deleteProject: Database.Statement
  countNodes: Database.Statement
  countEdges: Database.Statement
  searchNodesFts: Database.Statement
  getNodesByLabel: Database.Statement
  getNodesByFile: Database.Statement
  deleteNodesByProject: Database.Statement
  deleteNodesByFile: Database.Statement
  deleteEdgesByProject: Database.Statement
  upsertAdr: Database.Statement
  getAdr: Database.Statement
  deleteAdr: Database.Statement
  getNodeLabelCounts: Database.Statement
  getEdgeTypeCounts: Database.Statement
  getRelationshipPatterns: Database.Statement
  updateNodeProps: Database.Statement
}

// ─── GraphDatabase class ─────────────────────────────────────────────────────

export class GraphDatabase {
  private db: Database.Database
  private stmts!: PreparedStatements

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? getDbPath())
    this.applyPragmas()
    this.createSchema()
    this.prepareStatements()
  }

  // ─── Pragma configuration ───────────────────────────────────────────────

  private applyPragmas(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -64000') // 64MB
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('mmap_size = 268435456') // 256MB
    this.db.pragma('foreign_keys = ON')
  }

  // ─── Schema creation ───────────────────────────────────────────────────

  private createSchema(): void {
    this.db.exec(SCHEMA_SQL)
  }

  // ─── Prepared statements ────────────────────────────────────────────────

  private prepareStatements(): void {
    this.stmts = {
      insertNode: this.db.prepare(`
        INSERT OR REPLACE INTO nodes (id, project, label, name, qualified_name, file_path, start_line, end_line, props)
        VALUES (@id, @project, @label, @name, @qualified_name, @file_path, @start_line, @end_line, @props)
      `),

      insertEdge: this.db.prepare(`
        INSERT OR REPLACE INTO edges (project, source_id, target_id, type, props)
        VALUES (@project, @source_id, @target_id, @type, @props)
      `),

      deleteNode: this.db.prepare('DELETE FROM nodes WHERE id = ?'),

      deleteEdge: this.db.prepare('DELETE FROM edges WHERE id = ?'),

      getNode: this.db.prepare('SELECT * FROM nodes WHERE id = ?'),

      getEdgesBySource: this.db.prepare('SELECT * FROM edges WHERE source_id = ?'),

      getEdgesBySourceAndType: this.db.prepare('SELECT * FROM edges WHERE source_id = ? AND type = ?'),

      getEdgesByTarget: this.db.prepare('SELECT * FROM edges WHERE target_id = ?'),

      getEdgesByTargetAndType: this.db.prepare('SELECT * FROM edges WHERE target_id = ? AND type = ?'),

      upsertFileHash: this.db.prepare(`
        INSERT OR REPLACE INTO file_hashes (project, rel_path, content_hash, mtime_ns, size)
        VALUES (@project, @rel_path, @content_hash, @mtime_ns, @size)
      `),

      getFileHash: this.db.prepare('SELECT * FROM file_hashes WHERE project = ? AND rel_path = ?'),

      getAllFileHashes: this.db.prepare('SELECT * FROM file_hashes WHERE project = ?'),

      deleteFileHashes: this.db.prepare('DELETE FROM file_hashes WHERE project = ?'),

      deleteFileHash: this.db.prepare('DELETE FROM file_hashes WHERE project = ? AND rel_path = ?'),

      upsertProject: this.db.prepare(`
        INSERT OR REPLACE INTO projects (name, root_path, indexed_at, node_count, edge_count)
        VALUES (@name, @root_path, @indexed_at, @node_count, @edge_count)
      `),

      getProject: this.db.prepare('SELECT * FROM projects WHERE name = ?'),

      listProjects: this.db.prepare('SELECT * FROM projects ORDER BY name'),

      deleteProject: this.db.prepare('DELETE FROM projects WHERE name = ?'),

      countNodes: this.db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?'),

      countEdges: this.db.prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?'),

      searchNodesFts: this.db.prepare(`
        SELECT n.* FROM nodes n
        JOIN nodes_fts fts ON n.rowid = fts.rowid
        WHERE nodes_fts MATCH ?
        LIMIT ?
      `),

      getNodesByLabel: this.db.prepare('SELECT * FROM nodes WHERE project = ? AND label = ?'),

      getNodesByFile: this.db.prepare('SELECT * FROM nodes WHERE project = ? AND file_path = ?'),

      deleteNodesByProject: this.db.prepare('DELETE FROM nodes WHERE project = ?'),

      deleteNodesByFile: this.db.prepare('DELETE FROM nodes WHERE project = ? AND file_path = ?'),

      deleteEdgesByProject: this.db.prepare('DELETE FROM edges WHERE project = ?'),

      upsertAdr: this.db.prepare(`
        INSERT OR REPLACE INTO project_summaries (project, summary, source_hash, created_at, updated_at)
        VALUES (@project, @summary, @source_hash, @created_at, @updated_at)
      `),

      getAdr: this.db.prepare('SELECT * FROM project_summaries WHERE project = ?'),

      deleteAdr: this.db.prepare('DELETE FROM project_summaries WHERE project = ?'),

      getNodeLabelCounts: this.db.prepare(
        'SELECT label, COUNT(*) as count FROM nodes WHERE project = ? GROUP BY label',
      ),

      getEdgeTypeCounts: this.db.prepare(
        'SELECT type, COUNT(*) as count FROM edges WHERE project = ? GROUP BY type',
      ),

      getRelationshipPatterns: this.db.prepare(`
        SELECT DISTINCT
          ns.label || ' -[' || e.type || ']-> ' || nt.label AS pattern
        FROM edges e
        JOIN nodes ns ON e.source_id = ns.id
        JOIN nodes nt ON e.target_id = nt.id
        WHERE e.project = ?
        ORDER BY pattern
      `),

      updateNodeProps: this.db.prepare(`
        UPDATE nodes SET props = @props WHERE id = @id
      `),
    }
  }

  // ─── Row mapping helpers ────────────────────────────────────────────────

  private rowToNode(row: unknown): GraphNode {
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      project: r.project as string,
      label: r.label as NodeLabel,
      name: r.name as string,
      qualified_name: r.qualified_name as string,
      file_path: r.file_path as string | null,
      start_line: r.start_line as number | null,
      end_line: r.end_line as number | null,
      props: JSON.parse(r.props as string),
    }
  }

  private rowToEdge(row: unknown): GraphEdge {
    const r = row as Record<string, unknown>
    return {
      id: r.id as number,
      project: r.project as string,
      source_id: r.source_id as string,
      target_id: r.target_id as string,
      type: r.type as EdgeType,
      props: JSON.parse(r.props as string),
    }
  }

  // ─── Project operations ─────────────────────────────────────────────────

  upsertProject(project: ProjectRecord): void {
    this.stmts.upsertProject.run(project)
  }

  getProject(name: string): ProjectRecord | null {
    const row = this.stmts.getProject.get(name)
    if (!row) return null
    const r = row as Record<string, unknown>
    return {
      name: r.name as string,
      root_path: r.root_path as string,
      indexed_at: r.indexed_at as number,
      node_count: r.node_count as number,
      edge_count: r.edge_count as number,
    }
  }

  listProjects(): ProjectRecord[] {
    const rows = this.stmts.listProjects.all() as Record<string, unknown>[]
    return rows.map((r) => ({
      name: r.name as string,
      root_path: r.root_path as string,
      indexed_at: r.indexed_at as number,
      node_count: r.node_count as number,
      edge_count: r.edge_count as number,
    }))
  }

  deleteProject(name: string): void {
    // CASCADE deletes nodes + edges + project_summaries
    this.stmts.deleteProject.run(name)
  }

  // ─── Node operations ───────────────────────────────────────────────────

  insertNode(node: GraphNode): void {
    this.stmts.insertNode.run({
      id: node.id,
      project: node.project,
      label: node.label,
      name: node.name,
      qualified_name: node.qualified_name,
      file_path: node.file_path,
      start_line: node.start_line,
      end_line: node.end_line,
      props: JSON.stringify(node.props),
    })
  }

  insertNodes(nodes: GraphNode[]): void {
    this.transaction(() => {
      for (const node of nodes) {
        this.insertNode(node)
      }
    })
  }

  getNode(id: string): GraphNode | null {
    const row = this.stmts.getNode.get(id)
    if (!row) return null
    return this.rowToNode(row)
  }

  getNodesByLabel(project: string, label: NodeLabel): GraphNode[] {
    const rows = this.stmts.getNodesByLabel.all(project, label)
    return rows.map((r) => this.rowToNode(r))
  }

  getNodesByFile(project: string, filePath: string): GraphNode[] {
    const rows = this.stmts.getNodesByFile.all(project, filePath)
    return rows.map((r) => this.rowToNode(r))
  }

  deleteNodesByProject(project: string): void {
    this.stmts.deleteNodesByProject.run(project)
  }

  deleteNodesByFile(project: string, filePath: string): void {
    this.stmts.deleteNodesByFile.run(project, filePath)
  }

  updateNodeProps(id: string, props: Record<string, unknown>): void {
    this.stmts.updateNodeProps.run({ id, props: JSON.stringify(props) })
  }

  // ─── Edge operations ───────────────────────────────────────────────────

  insertEdge(edge: Omit<GraphEdge, 'id'>): void {
    this.stmts.insertEdge.run({
      project: edge.project,
      source_id: edge.source_id,
      target_id: edge.target_id,
      type: edge.type,
      props: JSON.stringify(edge.props),
    })
  }

  insertEdges(edges: Omit<GraphEdge, 'id'>[]): void {
    this.transaction(() => {
      for (const edge of edges) {
        this.insertEdge(edge)
      }
    })
  }

  getOutboundEdges(nodeId: string, type?: EdgeType): GraphEdge[] {
    const rows = type
      ? this.stmts.getEdgesBySourceAndType.all(nodeId, type)
      : this.stmts.getEdgesBySource.all(nodeId)
    return rows.map((r) => this.rowToEdge(r))
  }

  getInboundEdges(nodeId: string, type?: EdgeType): GraphEdge[] {
    const rows = type
      ? this.stmts.getEdgesByTargetAndType.all(nodeId, type)
      : this.stmts.getEdgesByTarget.all(nodeId)
    return rows.map((r) => this.rowToEdge(r))
  }

  deleteEdgesByProject(project: string): void {
    this.stmts.deleteEdgesByProject.run(project)
  }

  // ─── Search ────────────────────────────────────────────────────────────

  searchNodes(filter: NodeFilter): NodeSearchResult {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter.project) {
      conditions.push('n.project = ?')
      params.push(filter.project)
    }
    if (filter.label) {
      conditions.push('n.label = ?')
      params.push(filter.label)
    }
    if (filter.namePattern) {
      if (filter.caseSensitive) {
        conditions.push('n.name LIKE ?')
      } else {
        conditions.push('LOWER(n.name) LIKE LOWER(?)')
      }
      params.push(`%${filter.namePattern}%`)
    }
    if (filter.filePath) {
      conditions.push('n.file_path LIKE ?')
      params.push(`%${filter.filePath}%`)
    }

    // Degree filtering requires subqueries
    if (filter.minDegree !== undefined || filter.maxDegree !== undefined) {
      const edgeDir = filter.direction ?? 'both'
      const edgeType = filter.relationship

      const buildDegreeExpr = (): string => {
        const typeClause = edgeType ? ' AND e.type = ?' : ''
        if (edgeDir === 'inbound') {
          return `(SELECT COUNT(*) FROM edges e WHERE e.target_id = n.id${typeClause})`
        } else if (edgeDir === 'outbound') {
          return `(SELECT COUNT(*) FROM edges e WHERE e.source_id = n.id${typeClause})`
        } else {
          return `(SELECT COUNT(*) FROM edges e WHERE (e.source_id = n.id OR e.target_id = n.id)${typeClause})`
        }
      }

      if (filter.minDegree !== undefined) {
        const degreeExpr = buildDegreeExpr()
        if (edgeType) params.push(edgeType)
        conditions.push(`${degreeExpr} >= ?`)
        params.push(filter.minDegree)
      }
      if (filter.maxDegree !== undefined) {
        const degreeExpr = buildDegreeExpr()
        if (edgeType) params.push(edgeType)
        conditions.push(`${degreeExpr} <= ?`)
        params.push(filter.maxDegree)
      }
    }

    // Entry point exclusion
    if (filter.excludeEntryPoints) {
      conditions.push("json_extract(n.props, '$.is_entry_point') != 1")
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filter.limit ?? 100
    const offset = filter.offset ?? 0

    // Count total matching rows
    const countSql = `SELECT COUNT(*) as total FROM nodes n ${where}`
    const countRow = this.db.prepare(countSql).get(...params) as { total: number }
    const total = countRow.total

    // Fetch the requested page
    const dataSql = `SELECT * FROM nodes n ${where} ORDER BY n.name LIMIT ? OFFSET ?`
    const rows = this.db.prepare(dataSql).all(...params, limit, offset)

    return {
      nodes: rows.map((r) => this.rowToNode(r)),
      total,
      has_more: offset + limit < total,
    }
  }

  searchNodesFts(query: string, limit: number = 100): GraphNode[] {
    const rows = this.stmts.searchNodesFts.all(query, limit)
    return rows.map((r) => this.rowToNode(r))
  }

  // ─── File hash tracking ─────────────────────────────────────────────────

  upsertFileHash(record: FileHashRecord): void {
    this.stmts.upsertFileHash.run(record)
  }

  getFileHash(project: string, relPath: string): FileHashRecord | null {
    const row = this.stmts.getFileHash.get(project, relPath)
    if (!row) return null
    const r = row as Record<string, unknown>
    return {
      project: r.project as string,
      rel_path: r.rel_path as string,
      content_hash: r.content_hash as string,
      mtime_ns: r.mtime_ns as number,
      size: r.size as number,
    }
  }

  getAllFileHashes(project: string): FileHashRecord[] {
    const rows = this.stmts.getAllFileHashes.all(project) as Record<string, unknown>[]
    return rows.map((r) => ({
      project: r.project as string,
      rel_path: r.rel_path as string,
      content_hash: r.content_hash as string,
      mtime_ns: r.mtime_ns as number,
      size: r.size as number,
    }))
  }

  deleteFileHashes(project: string): void {
    this.stmts.deleteFileHashes.run(project)
  }

  deleteFileHash(project: string, relPath: string): void {
    this.stmts.deleteFileHash.run(project, relPath)
  }

  // ─── ADR ────────────────────────────────────────────────────────────────

  upsertAdr(record: ADRRecord): void {
    this.stmts.upsertAdr.run(record)
  }

  getAdr(project: string): ADRRecord | null {
    const row = this.stmts.getAdr.get(project)
    if (!row) return null
    const r = row as Record<string, unknown>
    return {
      project: r.project as string,
      summary: r.summary as string,
      source_hash: r.source_hash as string,
      created_at: r.created_at as number,
      updated_at: r.updated_at as number,
    }
  }

  deleteAdr(project: string): void {
    this.stmts.deleteAdr.run(project)
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
    const rows = this.stmts.getNodeLabelCounts.all(project) as Array<{
      label: string
      count: number
    }>
    const result = {} as Record<NodeLabel, number>
    for (const row of rows) {
      result[row.label as NodeLabel] = row.count
    }
    return result
  }

  getEdgeTypeCounts(project: string): Record<EdgeType, number> {
    const rows = this.stmts.getEdgeTypeCounts.all(project) as Array<{
      type: string
      count: number
    }>
    const result = {} as Record<EdgeType, number>
    for (const row of rows) {
      result[row.type as EdgeType] = row.count
    }
    return result
  }

  getRelationshipPatterns(project: string): string[] {
    const rows = this.stmts.getRelationshipPatterns.all(project) as Array<{
      pattern: string
    }>
    return rows.map((r) => r.pattern)
  }

  // ─── Degree queries ─────────────────────────────────────────────────────

  getNodeDegree(
    nodeId: string,
    type?: EdgeType,
    direction: 'in' | 'out' | 'both' = 'both',
  ): number {
    const conditions: string[] = []
    const params: unknown[] = []

    if (direction === 'in') {
      conditions.push('e.target_id = ?')
      params.push(nodeId)
    } else if (direction === 'out') {
      conditions.push('e.source_id = ?')
      params.push(nodeId)
    } else {
      conditions.push('(e.source_id = ? OR e.target_id = ?)')
      params.push(nodeId, nodeId)
    }

    if (type) {
      conditions.push('e.type = ?')
      params.push(type)
    }

    const sql = `SELECT COUNT(*) as count FROM edges e WHERE ${conditions.join(' AND ')}`
    const row = this.db.prepare(sql).get(...params) as { count: number }
    return row.count
  }

  getNodesByDegree(
    project: string,
    options: {
      label?: NodeLabel
      type?: EdgeType
      direction: 'in' | 'out' | 'both'
      minDegree?: number
      maxDegree?: number
      excludeEntryPoints?: boolean
      limit?: number
      offset?: number
    },
  ): NodeSearchResult {
    const { label, type, direction, minDegree, maxDegree, excludeEntryPoints } = options
    const limit = options.limit ?? 100
    const offset = options.offset ?? 0

    const conditions: string[] = ['n.project = ?']
    const params: unknown[] = [project]

    if (label) {
      conditions.push('n.label = ?')
      params.push(label)
    }

    if (excludeEntryPoints) {
      conditions.push("json_extract(n.props, '$.is_entry_point') != 1")
    }

    // Build degree expression
    const typeClause = type ? ' AND e.type = ?' : ''
    let degreeExpr: string
    if (direction === 'in') {
      degreeExpr = `(SELECT COUNT(*) FROM edges e WHERE e.target_id = n.id${typeClause})`
    } else if (direction === 'out') {
      degreeExpr = `(SELECT COUNT(*) FROM edges e WHERE e.source_id = n.id${typeClause})`
    } else {
      degreeExpr = `(SELECT COUNT(*) FROM edges e WHERE (e.source_id = n.id OR e.target_id = n.id)${typeClause})`
    }

    // Each use of degreeExpr needs its own type param binding
    if (minDegree !== undefined) {
      if (type) params.push(type)
      conditions.push(`${degreeExpr} >= ?`)
      params.push(minDegree)
    }
    if (maxDegree !== undefined) {
      if (type) params.push(type)
      conditions.push(`${degreeExpr} <= ?`)
      params.push(maxDegree)
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM nodes n ${where}`
    const countRow = this.db.prepare(countSql).get(...params) as { total: number }
    const total = countRow.total

    // Fetch page
    const dataSql = `SELECT * FROM nodes n ${where} ORDER BY n.name LIMIT ? OFFSET ?`
    const rows = this.db.prepare(dataSql).all(...params, limit, offset)

    return {
      nodes: rows.map((r) => this.rowToNode(r)),
      total,
      has_more: offset + limit < total,
    }
  }

  // ─── Graph traversal (BFS via recursive CTE) ───────────────────────────

  bfsTraversal(options: {
    startNodeId: string
    edgeTypes: EdgeType[]
    direction: 'outbound' | 'inbound'
    maxDepth: number
    maxNodes?: number
  }): Array<{ id: string; depth: number; path: string[] }> {
    const { startNodeId, edgeTypes, direction, maxDepth, maxNodes = 200 } = options

    // Sanitize edge types — they are constrained to the EdgeType union so
    // building a comma-separated list of quoted literals is safe here.
    const typeList = edgeTypes.map((t) => `'${t}'`).join(',')

    const edgeCondition =
      direction === 'outbound'
        ? `e.source_id = r.id AND e.type IN (${typeList})`
        : `e.target_id = r.id AND e.type IN (${typeList})`

    const nextNode = direction === 'outbound' ? 'e.target_id' : 'e.source_id'

    const sql = `
      WITH RECURSIVE reachable(id, depth, path) AS (
        SELECT ?, 0, ?
        UNION ALL
        SELECT ${nextNode}, r.depth + 1, r.path || '>' || ${nextNode}
        FROM reachable r
        JOIN edges e ON ${edgeCondition}
        WHERE r.depth < ?
          AND r.path NOT LIKE '%' || ${nextNode} || '%'
      )
      SELECT id, depth, path FROM reachable
      WHERE depth > 0
      ORDER BY depth
      LIMIT ?
    `

    const rows = this.db.prepare(sql).all(startNodeId, startNodeId, maxDepth, maxNodes) as Array<{
      id: string
      depth: number
      path: string
    }>

    return rows.map((r) => ({
      id: r.id,
      depth: r.depth,
      path: r.path.split('>'),
    }))
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

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  close(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    this.db.close()
  }
}
