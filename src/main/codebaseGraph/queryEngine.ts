/**
 * queryEngine.ts — High-level query operations over the codebase graph.
 *
 * Provides BFS call-path tracing with risk classification, git-aware impact
 * analysis (blast radius), architecture overview computation, schema
 * introspection, grep-like code search, and source snippet retrieval.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { GraphDatabase } from './graphDatabase'
import type { GraphNode, EdgeType } from './graphDatabaseTypes'
import type {
  TraceCallPathOptions,
  TraceResult,
  TraceNode,
  TraceEdge,
  DetectChangesOptions,
  DetectChangesResult,
  ChangedFileInfo,
  ChangedSymbol,
  ImpactedCaller,
  RiskLevel,
  ArchitectureAspect,
  ArchitectureResult,
  GraphSchemaResult,
  CodeSearchOptions,
  CodeSearchResult,
} from './queryEngineTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BFS_NODES = 200
const MAX_DEPTH = 5
const CALL_EDGE_TYPES: EdgeType[] = ['CALLS', 'HTTP_CALLS', 'ASYNC_CALLS']
const SYMBOL_LABELS = ['Function', 'Method', 'Class', 'Interface', 'Type', 'Enum'] as const

// ─── QueryEngine ──────────────────────────────────────────────────────────────

export class QueryEngine {
  constructor(
    private db: GraphDatabase,
    private projectName: string,
    private projectRoot: string,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // trace_call_path
  // ═══════════════════════════════════════════════════════════════════════════

  traceCallPath(options: TraceCallPathOptions): TraceResult {
    const emptyResult: TraceResult = {
      startNode: null as unknown as TraceNode,
      nodes: [],
      edges: [],
      totalNodes: 0,
      truncated: false,
    }

    // Find the start node by exact name match
    const candidates = this.db.searchNodes({
      project: this.projectName,
      namePattern: options.functionName,
      caseSensitive: true,
      limit: 50,
    })

    // Exact match filter
    let exactMatches = candidates.nodes.filter(
      (n) => n.name === options.functionName,
    )

    // Fall back to case-insensitive if no exact matches
    if (exactMatches.length === 0) {
      const lowerName = options.functionName.toLowerCase()
      exactMatches = candidates.nodes.filter(
        (n) => n.name.toLowerCase() === lowerName,
      )
    }

    if (exactMatches.length === 0) {
      return emptyResult
    }

    const startNode = exactMatches[0]
    const clampedDepth = Math.min(Math.max(options.depth, 1), MAX_DEPTH)

    const results: TraceNode[] = []
    const traceEdges: TraceEdge[] = []

    const runDirection = (direction: 'outbound' | 'inbound'): void => {
      const bfsResults = this.db.bfsTraversal({
        startNodeId: startNode.id,
        edgeTypes: CALL_EDGE_TYPES,
        direction,
        maxDepth: clampedDepth,
        maxNodes: MAX_BFS_NODES,
      })

      for (const result of bfsResults) {
        const node = this.db.getNode(result.id)
        if (!node) continue

        const traceNode: TraceNode = {
          id: node.id,
          name: node.name,
          label: node.label,
          filePath: node.file_path,
          startLine: node.start_line,
          signature: this.getNodeSignature(node),
          depth: result.depth,
        }

        if (options.riskLabels) {
          traceNode.risk = this.classifyRisk(node, result.depth)
        }

        results.push(traceNode)

        // Create edge records from the BFS path
        for (let i = 0; i < result.path.length - 1; i++) {
          traceEdges.push({
            source: result.path[i],
            target: result.path[i + 1],
            type: 'CALLS',
          })
        }
      }
    }

    if (options.direction === 'both' || options.direction === 'outbound') {
      runDirection('outbound')
    }
    if (options.direction === 'both' || options.direction === 'inbound') {
      runDirection('inbound')
    }

    // Deduplicate nodes
    const seenNodes = new Set<string>()
    const uniqueNodes = results.filter((n) => {
      if (seenNodes.has(n.id)) return false
      seenNodes.add(n.id)
      return true
    })

    // Deduplicate edges
    const seenEdges = new Set<string>()
    const uniqueEdges = traceEdges.filter((e) => {
      const key = `${e.source}|${e.target}`
      if (seenEdges.has(key)) return false
      seenEdges.add(key)
      return true
    })

    const startTraceNode: TraceNode = {
      id: startNode.id,
      name: startNode.name,
      label: startNode.label,
      filePath: startNode.file_path,
      startLine: startNode.start_line,
      signature: this.getNodeSignature(startNode),
      depth: 0,
    }

    let impactSummary: string | undefined
    if (options.riskLabels) {
      const riskCounts: Record<RiskLevel, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      }
      for (const n of uniqueNodes) {
        if (n.risk) riskCounts[n.risk]++
      }
      impactSummary = `Impact: ${riskCounts.CRITICAL} critical, ${riskCounts.HIGH} high, ${riskCounts.MEDIUM} medium, ${riskCounts.LOW} low`
    }

    return {
      startNode: startTraceNode,
      nodes: uniqueNodes,
      edges: uniqueEdges,
      totalNodes: uniqueNodes.length,
      truncated: uniqueNodes.length >= MAX_BFS_NODES,
      impactSummary,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // detect_changes
  // ═══════════════════════════════════════════════════════════════════════════

  detectChanges(options: DetectChangesOptions): DetectChangesResult {
    const emptyResult: DetectChangesResult = {
      changedFiles: [],
      changedSymbols: [],
      impactedCallers: [],
      riskSummary: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    }

    // Get changed files from git
    const changedFiles = this.getGitChangedFiles(options)
    if (changedFiles.length === 0) return emptyResult

    // Map changed files to graph symbols
    const changedSymbols: ChangedSymbol[] = []
    for (const file of changedFiles) {
      if (file.status === 'deleted') continue

      const fileNodes = this.db.getNodesByFile(this.projectName, file.path)
      for (const node of fileNodes) {
        if ((SYMBOL_LABELS as readonly string[]).includes(node.label)) {
          changedSymbols.push({
            name: node.name,
            label: node.label,
            filePath: file.path,
            qualifiedName: node.id,
          })
        }
      }
    }

    // BFS from changed symbols to find impacted callers
    const impactedCallers: ImpactedCaller[] = []
    const seen = new Set<string>()
    const changedIds = new Set(changedSymbols.map((s) => s.qualifiedName))
    const clampedDepth = Math.min(Math.max(options.depth, 1), MAX_DEPTH)

    for (const symbol of changedSymbols) {
      const bfsResults = this.db.bfsTraversal({
        startNodeId: symbol.qualifiedName,
        edgeTypes: CALL_EDGE_TYPES,
        direction: 'inbound',
        maxDepth: clampedDepth,
        maxNodes: 100,
      })

      for (const result of bfsResults) {
        if (seen.has(result.id)) continue
        seen.add(result.id)

        // Don't list the changed symbol itself as an impacted caller
        if (changedIds.has(result.id)) continue

        const node = this.db.getNode(result.id)
        if (!node) continue

        impactedCallers.push({
          name: node.name,
          label: node.label,
          filePath: node.file_path,
          qualifiedName: node.id,
          depth: result.depth,
          risk: this.classifyRisk(node, result.depth),
        })
      }
    }

    // Risk summary
    const riskSummary: Record<RiskLevel, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    }
    for (const caller of impactedCallers) {
      riskSummary[caller.risk]++
    }

    return {
      changedFiles,
      changedSymbols,
      impactedCallers,
      riskSummary,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // get_architecture
  // ═══════════════════════════════════════════════════════════════════════════

  getArchitecture(aspects: ArchitectureAspect[]): ArchitectureResult {
    const includeAll = aspects.includes('all')
    const result: Record<string, string> = {}

    if (includeAll || aspects.includes('languages')) {
      result.languages = this.computeLanguages()
    }
    if (includeAll || aspects.includes('packages')) {
      result.packages = this.computePackages()
    }
    if (includeAll || aspects.includes('entry_points')) {
      result.entry_points = this.computeEntryPoints()
    }
    if (includeAll || aspects.includes('routes')) {
      result.routes = this.computeRoutes()
    }
    if (includeAll || aspects.includes('hotspots')) {
      result.hotspots = this.computeHotspots()
    }
    if (includeAll || aspects.includes('file_tree')) {
      result.file_tree = this.computeFileTree()
    }
    if (includeAll || aspects.includes('layers')) {
      result.layers = this.computeLayers()
    }
    if (includeAll || aspects.includes('adr')) {
      const adr = this.db.getAdr(this.projectName)
      result.adr = adr ? adr.summary : 'No ADR recorded.'
    }

    return { projectName: this.projectName, aspects: result }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // get_graph_schema
  // ═══════════════════════════════════════════════════════════════════════════

  getGraphSchema(): GraphSchemaResult {
    const nodeLabelCounts = this.db.getNodeLabelCounts(this.projectName)
    const edgeTypeCounts = this.db.getEdgeTypeCounts(this.projectName)
    const relationshipPatterns = this.db.getRelationshipPatterns(
      this.projectName,
    )

    // Sample names for orientation
    const functions = this.db.getNodesByLabel(this.projectName, 'Function')
    const classes = this.db.getNodesByLabel(this.projectName, 'Class')

    return {
      nodeLabelCounts: nodeLabelCounts as Record<string, number>,
      edgeTypeCounts: edgeTypeCounts as Record<string, number>,
      relationshipPatterns,
      sampleNames: {
        functions: functions.slice(0, 10).map((f) => f.name),
        classes: classes.slice(0, 10).map((c) => c.name),
        qualifiedNames: functions.slice(0, 5).map((f) => f.qualified_name),
      },
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // search_code (grep-like text search)
  // ═══════════════════════════════════════════════════════════════════════════

  searchCode(
    options: CodeSearchOptions,
  ): { results: CodeSearchResult[]; total: number; hasMore: boolean } {
    const maxResults = options.maxResults ?? 100
    const offset = options.offset ?? 0
    const results: CodeSearchResult[] = []

    // Get all file nodes to search
    const files = this.db.getNodesByLabel(this.projectName, 'File')

    let regex: RegExp
    try {
      if (options.regex) {
        regex = new RegExp(options.pattern, options.caseSensitive ? 'g' : 'gi')
      } else {
        const escaped = options.pattern.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        )
        regex = new RegExp(escaped, options.caseSensitive ? 'g' : 'gi')
      }
    } catch {
      // Invalid regex pattern
      return { results: [], total: 0, hasMore: false }
    }

    // File pattern filter
    let fileFilter: RegExp | null = null
    if (options.filePattern) {
      try {
        const globToRegex = options.filePattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '\u0000') // placeholder for **
          .replace(/\*/g, '[^/]*')
          .replace(/\u0000/g, '.*')
          .replace(/\?/g, '.')
        fileFilter = new RegExp(globToRegex)
      } catch {
        // Invalid file pattern
        return { results: [], total: 0, hasMore: false }
      }
    }

    let total = 0

    for (const file of files) {
      const filePath = (file.props as Record<string, unknown>).path as string
      if (!filePath) continue
      if (fileFilter && !fileFilter.test(filePath)) continue

      const absolutePath = path.resolve(this.projectRoot, filePath)
      let content: string
      try {
        content = fs.readFileSync(absolutePath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0
        const match = regex.exec(lines[i])
        if (match) {
          total++
          if (total > offset && results.length < maxResults) {
            results.push({
              filePath,
              lineNumber: i + 1,
              lineContent: lines[i].slice(0, 200), // Truncate long lines
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            })
          }
        }
      }
    }

    return {
      results,
      total,
      hasMore: total > offset + maxResults,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // get_code_snippet
  // ═══════════════════════════════════════════════════════════════════════════

  getCodeSnippet(qualifiedName: string): string | null {
    const node = this.db.getNode(qualifiedName)
    if (!node || !node.file_path || !node.start_line || !node.end_line) {
      return null
    }

    const absolutePath = path.resolve(this.projectRoot, node.file_path)
    try {
      const content = fs.readFileSync(absolutePath, 'utf-8')
      const lines = content.split('\n')
      const startLine = Math.max(0, node.start_line - 1) // Convert to 0-based
      const endLine = Math.min(lines.length, node.end_line)

      return lines.slice(startLine, endLine).join('\n')
    } catch {
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Classify risk level based on node degree, entry point status, and depth
   * from the changed symbol.
   */
  private classifyRisk(node: GraphNode, depth: number): RiskLevel {
    const props = node.props as Record<string, unknown>

    // Entry points at depth 1 are CRITICAL
    if (props.is_entry_point && depth <= 1) return 'CRITICAL'

    // High inbound degree = more callers = higher risk
    const inboundDegree =
      this.db.getNodeDegree(node.id, 'CALLS', 'in') +
      this.db.getNodeDegree(node.id, 'ASYNC_CALLS', 'in')

    if (inboundDegree > 10) return 'CRITICAL'
    if (inboundDegree > 5 || depth <= 1) return 'HIGH'
    if (inboundDegree > 2 || depth <= 2) return 'MEDIUM'
    return 'LOW'
  }

  /** Extract the signature prop from a graph node. */
  private getNodeSignature(node: GraphNode): string | null {
    const props = node.props as Record<string, unknown>
    return (props.signature as string) ?? null
  }

  /**
   * Run git diff with the appropriate scope and parse the --name-status output
   * into structured ChangedFileInfo records.
   */
  private getGitChangedFiles(options: DetectChangesOptions): ChangedFileInfo[] {
    let diffCmd: string
    switch (options.scope) {
      case 'unstaged':
        diffCmd = 'git diff --name-status'
        break
      case 'staged':
        diffCmd = 'git diff --cached --name-status'
        break
      case 'all':
        diffCmd = 'git diff HEAD --name-status'
        break
      case 'branch': {
        const base = options.baseBranch ?? 'main'
        diffCmd = `git diff ${base}...HEAD --name-status`
        break
      }
    }

    try {
      const output = execSync(diffCmd, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024,
      }).trim()

      if (!output) return []

      return output.split('\n').map((line) => {
        const [status, ...pathParts] = line.split('\t')
        const filePath = pathParts.join('\t') // Handle paths with tabs

        let fileStatus: ChangedFileInfo['status']
        switch (status.charAt(0)) {
          case 'A':
            fileStatus = 'added'
            break
          case 'D':
            fileStatus = 'deleted'
            break
          case 'R':
            fileStatus = 'renamed'
            break
          default:
            fileStatus = 'modified'
            break
        }

        return { path: filePath, status: fileStatus }
      })
    } catch {
      return []
    }
  }

  /** Count files per language from File nodes. */
  private computeLanguages(): string {
    const files = this.db.getNodesByLabel(this.projectName, 'File')
    if (files.length === 0) return 'No files indexed.'

    const langCounts = new Map<string, number>()
    for (const f of files) {
      const lang =
        ((f.props as Record<string, unknown>).language as string) ?? 'unknown'
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1)
    }

    return Array.from(langCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang}: ${count} files`)
      .join('\n')
  }

  /** List all Package nodes. */
  private computePackages(): string {
    const packages = this.db.getNodesByLabel(this.projectName, 'Package')
    if (packages.length === 0) return 'No packages detected.'

    return packages
      .map((p) => p.name)
      .sort()
      .join('\n')
  }

  /** Find nodes flagged as entry points. */
  private computeEntryPoints(): string {
    const allSymbols = this.db.searchNodes({
      project: this.projectName,
      limit: 1000,
    })

    const entryPoints = allSymbols.nodes.filter((n) => {
      const props = n.props as Record<string, unknown>
      return props.is_entry_point === true
    })

    if (entryPoints.length === 0) return 'No entry points detected.'

    return entryPoints
      .map((ep) => `${ep.label} ${ep.name} (${ep.file_path ?? 'unknown'})`)
      .join('\n')
  }

  /** List all Route nodes with method, path, and handler. */
  private computeRoutes(): string {
    const routes = this.db.getNodesByLabel(this.projectName, 'Route')
    if (routes.length === 0) return 'No routes detected.'

    return routes
      .map((r) => {
        const props = r.props as Record<string, unknown>
        const method = (props.method as string) ?? '?'
        const routePath = (props.path as string) ?? '?'
        const handler = (props.handler as string) ?? '(anonymous)'
        return `${method} ${routePath} -> ${handler} (${r.file_path ?? 'unknown'})`
      })
      .join('\n')
  }

  /** Top 20 nodes by combined degree (inbound + outbound). */
  private computeHotspots(): string {
    const functions = this.db
      .getNodesByLabel(this.projectName, 'Function')
      .concat(this.db.getNodesByLabel(this.projectName, 'Method'))

    if (functions.length === 0) return 'No functions or methods indexed.'

    const scored = functions.map((fn) => ({
      fn,
      score: this.db.getNodeDegree(fn.id, undefined, 'both'),
    }))

    scored.sort((a, b) => b.score - a.score)

    return scored
      .slice(0, 20)
      .map(
        ({ fn, score }) =>
          `${fn.name} (degree: ${score}) -- ${fn.file_path ?? 'unknown'}:${fn.start_line ?? '?'}`,
      )
      .join('\n')
  }

  /** Build an indented file tree from Folder nodes. */
  private computeFileTree(): string {
    const folders = this.db.getNodesByLabel(this.projectName, 'Folder')
    if (folders.length === 0) return 'No folder structure indexed.'

    const sortedPaths = folders
      .map((f) => (f.props as Record<string, unknown>).path as string)
      .filter(Boolean)
      .sort()

    return sortedPaths
      .map((p) => {
        const depth = p.split('/').length - 1
        const indent = '  '.repeat(depth)
        const name = path.basename(p)
        return `${indent}${name}/`
      })
      .join('\n')
  }

  /**
   * Heuristic layer detection based on folder path patterns.
   * Assigns folders to architectural layers: Presentation, API/Routes,
   * Business Logic, Data Access, Configuration, Infrastructure.
   */
  private computeLayers(): string {
    const folders = this.db.getNodesByLabel(this.projectName, 'Folder')
    if (folders.length === 0) return 'No folder structure indexed.'

    const layers: Record<string, string[]> = {
      Presentation: [],
      'API/Routes': [],
      'Business Logic': [],
      'Data Access': [],
      Configuration: [],
      Infrastructure: [],
    }

    for (const folder of folders) {
      const p = (
        ((folder.props as Record<string, unknown>).path as string) ?? ''
      ).toLowerCase()

      if (
        p.includes('component') ||
        p.includes('view') ||
        p.includes('page') ||
        p.includes('renderer') ||
        p.includes('ui') ||
        p.includes('frontend')
      ) {
        layers['Presentation'].push(folder.name)
      } else if (
        p.includes('route') ||
        p.includes('api') ||
        p.includes('controller') ||
        p.includes('handler') ||
        p.includes('endpoint')
      ) {
        layers['API/Routes'].push(folder.name)
      } else if (
        p.includes('service') ||
        p.includes('usecase') ||
        p.includes('domain') ||
        p.includes('logic') ||
        p.includes('core')
      ) {
        layers['Business Logic'].push(folder.name)
      } else if (
        p.includes('model') ||
        p.includes('repo') ||
        p.includes('database') ||
        p.includes('store') ||
        p.includes('db') ||
        p.includes('data')
      ) {
        layers['Data Access'].push(folder.name)
      } else if (
        p.includes('config') ||
        p.includes('setting') ||
        p.includes('env')
      ) {
        layers['Configuration'].push(folder.name)
      } else if (
        p.includes('infra') ||
        p.includes('deploy') ||
        p.includes('docker') ||
        p.includes('ci') ||
        p.includes('scripts')
      ) {
        layers['Infrastructure'].push(folder.name)
      }
    }

    const nonEmpty = Object.entries(layers).filter(
      ([, folderNames]) => folderNames.length > 0,
    )

    if (nonEmpty.length === 0) return 'No layer patterns detected.'

    return nonEmpty
      .map(([layer, folderNames]) => `## ${layer}\n${folderNames.join(', ')}`)
      .join('\n\n')
  }
}
