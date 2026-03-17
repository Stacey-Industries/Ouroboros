/**
 * graphQuery.ts — Query engine for search, trace, and structural analysis.
 */

import fs from 'fs/promises'
import path from 'path'
import type { GraphStore } from './graphStore'
import type {
  GraphNode,
  GraphEdge,
  SearchResult,
  CallPathResult,
  ArchitectureView,
  ChangeDetectionResult,
  CodeSnippetResult,
  GraphSchema,
} from './graphTypes'

export class GraphQueryEngine {
  constructor(
    private store: GraphStore,
    private projectRoot: string
  ) {}

  // --- searchGraph: fuzzy search nodes by name ---
  searchGraph(query: string, limit = 20): SearchResult[] {
    const results: SearchResult[] = []
    const lowerQuery = query.toLowerCase()
    const allNodes = this.store.getAllNodes()

    for (const node of allNodes) {
      const lowerName = node.name.toLowerCase()

      if (lowerName === lowerQuery) {
        results.push({ node, score: 100, matchReason: 'exact match' })
      } else if (lowerName.startsWith(lowerQuery)) {
        results.push({ node, score: 80, matchReason: 'prefix match' })
      } else if (lowerName.includes(lowerQuery)) {
        results.push({ node, score: 60, matchReason: 'substring match' })
      } else if (this.fuzzyMatch(lowerQuery, lowerName)) {
        results.push({ node, score: 40, matchReason: 'fuzzy match' })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  private fuzzyMatch(query: string, target: string): boolean {
    let qi = 0
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (query[qi] === target[ti]) qi++
    }
    return qi === query.length
  }

  // --- searchCode: regex search across files ---
  async searchCode(
    pattern: string,
    opts?: { fileGlob?: string; maxResults?: number }
  ): Promise<Array<{ filePath: string; line: number; match: string }>> {
    const maxResults = opts?.maxResults ?? 100
    const results: Array<{ filePath: string; line: number; match: string }> = []

    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'gi')
    } catch {
      return results
    }

    const fileNodes = this.store.getNodesByType('file')
    const fileGlob = opts?.fileGlob

    for (const fileNode of fileNodes) {
      if (results.length >= maxResults) break

      // Simple glob filter
      if (fileGlob && !this.matchGlob(fileNode.filePath, fileGlob)) continue

      const fullPath = path.join(this.projectRoot, fileNode.filePath)
      let content: string
      try {
        content = await fs.readFile(fullPath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        regex.lastIndex = 0
        if (regex.test(lines[i])) {
          results.push({
            filePath: fileNode.filePath,
            line: i + 1,
            match: lines[i].trim(),
          })
        }
      }
    }

    return results
  }

  private matchGlob(filePath: string, glob: string): boolean {
    // Simple glob matching: *.ts, **/*.tsx, src/*.ts
    const regexStr = glob
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    try {
      return new RegExp(`^${regexStr}$`).test(filePath) || new RegExp(regexStr).test(filePath)
    } catch {
      return false
    }
  }

  // --- traceCallPath: BFS between two symbols ---
  traceCallPath(fromId: string, toId: string, maxDepth = 10): CallPathResult {
    const fromNode = this.store.getNode(fromId)
    const toNode = this.store.getNode(toId)

    if (!fromNode || !toNode) {
      return { found: false, path: [], edges: [] }
    }

    // BFS
    const visited = new Set<string>()
    const queue: Array<{ nodeId: string; path: string[]; edges: GraphEdge[] }> = [
      { nodeId: fromId, path: [fromId], edges: [] },
    ]
    visited.add(fromId)

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.path.length > maxDepth + 1) continue

      if (current.nodeId === toId) {
        const pathNodes = current.path
          .map((id) => this.store.getNode(id))
          .filter((n): n is GraphNode => n !== undefined)
        return { found: true, path: pathNodes, edges: current.edges }
      }

      // Traverse outgoing edges (calls, imports, depends_on, contains)
      const outEdges = this.store.getEdgesFrom(current.nodeId)
      for (const edge of outEdges) {
        if (visited.has(edge.target)) continue
        if (edge.type === 'calls' || edge.type === 'imports' || edge.type === 'depends_on' || edge.type === 'contains') {
          visited.add(edge.target)
          queue.push({
            nodeId: edge.target,
            path: [...current.path, edge.target],
            edges: [...current.edges, edge],
          })
        }
      }
    }

    return { found: false, path: [], edges: [] }
  }

  // --- getArchitecture: structural overview ---
  getArchitecture(aspects?: string[]): ArchitectureView {
    const showAll = !aspects || aspects.length === 0
    const showModules = showAll || aspects!.includes('modules')
    const showHotspots = showAll || aspects!.includes('hotspots')
    const showFileTree = showAll || aspects!.includes('file_tree')

    const allNodes = this.store.getAllNodes()
    const allEdges = this.store.getAllEdges()

    // Modules: group files by top-level directory
    let modules: ArchitectureView['modules'] = []
    if (showModules) {
      const moduleMap = new Map<string, { files: Set<string>; exports: Set<string> }>()
      for (const node of allNodes) {
        if (node.type === 'file') {
          const parts = node.filePath.split('/')
          const moduleName = parts.length > 1 ? parts[0] + '/' + parts[1] : parts[0]
          const mod = moduleMap.get(moduleName) ?? { files: new Set(), exports: new Set() }
          mod.files.add(node.filePath)
          moduleMap.set(moduleName, mod)
        }
      }
      // Gather exports per module
      for (const edge of allEdges) {
        if (edge.type === 'exports') {
          const targetNode = this.store.getNode(edge.target)
          if (targetNode) {
            const parts = targetNode.filePath.split('/')
            const moduleName = parts.length > 1 ? parts[0] + '/' + parts[1] : parts[0]
            const mod = moduleMap.get(moduleName)
            if (mod) mod.exports.add(targetNode.name)
          }
        }
      }
      modules = Array.from(moduleMap.entries()).map(([name, data]) => ({
        name,
        rootPath: name,
        fileCount: data.files.size,
        exports: Array.from(data.exports).slice(0, 20),
      }))
      modules.sort((a, b) => b.fileCount - a.fileCount)
    }

    // Hotspots: nodes with highest in/out degree
    let hotspots: ArchitectureView['hotspots'] = []
    if (showHotspots) {
      const fileNodes = this.store.getNodesByType('file')
      const hotspotData = fileNodes.map((node) => {
        const inDegree = this.store.getEdgesTo(node.id).length
        const outDegree = this.store.getEdgesFrom(node.id).length
        return { filePath: node.filePath, inDegree, outDegree }
      })
      hotspotData.sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree))
      hotspots = hotspotData.slice(0, 20)
    }

    // File tree
    let fileTree: ArchitectureView['fileTree'] = []
    if (showFileTree) {
      const dirMap = new Map<string, Set<string>>()
      for (const node of allNodes) {
        if (node.type === 'file') {
          const dir = path.dirname(node.filePath)
          const existing = dirMap.get(dir) ?? new Set()
          existing.add(node.filePath)
          dirMap.set(dir, existing)
        }
      }
      // Build directory entries
      for (const [dir, files] of dirMap) {
        fileTree.push({
          path: dir,
          type: 'directory',
          children: Array.from(files),
        })
      }
      fileTree.sort((a, b) => a.path.localeCompare(b.path))
    }

    return {
      projectName: path.basename(this.projectRoot),
      modules,
      hotspots,
      fileTree,
    }
  }

  // --- getCodeSnippet: source + context for a symbol ---
  async getCodeSnippet(symbolId: string): Promise<CodeSnippetResult | null> {
    const node = this.store.getNode(symbolId)
    if (!node) return null

    const fullPath = path.join(this.projectRoot, node.filePath)
    let content = ''
    try {
      const fileContent = await fs.readFile(fullPath, 'utf-8')
      const lines = fileContent.split('\n')
      const startLine = Math.max(0, node.line - 1)
      const endLine = node.endLine ? Math.min(lines.length, node.endLine) : Math.min(lines.length, startLine + 30)
      content = lines.slice(startLine, endLine).join('\n')
    } catch {
      // File may have been deleted
    }

    // Find dependencies (what this symbol depends on)
    const outEdges = this.store.getEdgesFrom(symbolId)
    const dependencies = outEdges
      .map((e) => this.store.getNode(e.target)?.name)
      .filter((n): n is string => n !== undefined)

    // Find dependents (what depends on this symbol)
    const inEdges = this.store.getEdgesTo(symbolId)
    const dependents = inEdges
      .map((e) => this.store.getNode(e.source)?.name)
      .filter((n): n is string => n !== undefined)

    return { node, content, dependencies, dependents }
  }

  // --- detectChanges: compare fs against indexed state ---
  async detectChanges(): Promise<ChangeDetectionResult> {
    const fileNodes = this.store.getNodesByType('file')
    const changedFiles: string[] = []
    const affectedSymbols: GraphNode[] = []

    for (const fileNode of fileNodes) {
      const fullPath = path.join(this.projectRoot, fileNode.filePath)
      try {
        const stat = await fs.stat(fullPath)
        const mtime = stat.mtimeMs
        const lastIndexed = (fileNode.metadata?.mtime as number) ?? 0
        if (mtime > lastIndexed) {
          changedFiles.push(fileNode.filePath)
          // Gather all symbols in this file
          const symbols = this.store.getNodesByFile(fileNode.filePath)
          affectedSymbols.push(...symbols.filter((s) => s.type !== 'file'))
        }
      } catch {
        // File deleted
        changedFiles.push(fileNode.filePath)
        const symbols = this.store.getNodesByFile(fileNode.filePath)
        affectedSymbols.push(...symbols.filter((s) => s.type !== 'file'))
      }
    }

    // Blast radius: count dependents of affected symbols
    const affectedIds = new Set(affectedSymbols.map((s) => s.id))
    let blastRadius = affectedIds.size
    for (const sym of affectedSymbols) {
      const dependents = this.store.getEdgesTo(sym.id)
      for (const dep of dependents) {
        if (!affectedIds.has(dep.source)) {
          blastRadius++
          affectedIds.add(dep.source)
        }
      }
    }

    return { changedFiles, affectedSymbols, blastRadius }
  }

  // --- getGraphSchema: describe the graph structure ---
  getGraphSchema(): GraphSchema {
    const nodeTypes = new Set<string>()
    const edgeTypes = new Set<string>()

    for (const node of this.store.getAllNodes()) {
      nodeTypes.add(node.type)
    }
    for (const edge of this.store.getAllEdges()) {
      edgeTypes.add(edge.type)
    }

    return {
      nodeTypes: Array.from(nodeTypes),
      edgeTypes: Array.from(edgeTypes),
      nodeCount: this.store.nodeCount(),
      edgeCount: this.store.edgeCount(),
    }
  }

  // --- queryGraph: simple Cypher-like query ---
  queryGraph(query: string): Array<Record<string, unknown>> {
    try {
      return this.executeCypherLike(query)
    } catch (err) {
      console.warn('[graph-query] Query parse error:', err)
      return []
    }
  }

  private executeCypherLike(query: string): Array<Record<string, unknown>> {
    const trimmed = query.trim()

    // Parse MATCH clause
    const matchNodeRe = /MATCH\s+\((\w+)(?::(\w+))?\)/i
    const matchEdgeRe = /MATCH\s+\((\w+)\)-\[:(\w+)\]->\((\w+)\)/i

    // Parse WHERE clause
    const whereContainsRe = /WHERE\s+(\w+)\.(\w+)\s+CONTAINS\s+'([^']+)'/i
    const whereEqualsRe = /WHERE\s+(\w+)\.(\w+)\s*=\s*'([^']+)'/i
    const whereStartsWithRe = /WHERE\s+(\w+)\.(\w+)\s+STARTS\s+WITH\s+'([^']+)'/i

    // Parse LIMIT
    const limitRe = /LIMIT\s+(\d+)/i
    const limitMatch = limitRe.exec(trimmed)
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 100

    // Parse RETURN
    const returnRe = /RETURN\s+(.+?)(?:\s+LIMIT|\s*$)/i
    const returnMatch = returnRe.exec(trimmed)
    const returnFields = returnMatch
      ? returnMatch[1].split(',').map((f) => f.trim())
      : []

    // Edge traversal query
    const edgeMatch = matchEdgeRe.exec(trimmed)
    if (edgeMatch) {
      const [, sourceVar, edgeType, targetVar] = edgeMatch
      return this.executeEdgeQuery(
        sourceVar, edgeType, targetVar,
        trimmed, returnFields, limit
      )
    }

    // Node-only query
    const nodeMatch = matchNodeRe.exec(trimmed)
    if (nodeMatch) {
      const [, varName, nodeType] = nodeMatch
      return this.executeNodeQuery(
        varName, nodeType,
        trimmed, returnFields, limit
      )
    }

    return []
  }

  private executeNodeQuery(
    varName: string,
    nodeType: string | undefined,
    fullQuery: string,
    returnFields: string[],
    limit: number
  ): Array<Record<string, unknown>> {
    let nodes = nodeType
      ? this.store.getNodesByType(nodeType as GraphNode['type'])
      : this.store.getAllNodes()

    // Apply WHERE filters
    nodes = this.applyWhereFilter(nodes, varName, fullQuery)

    // Apply RETURN projection
    const results: Array<Record<string, unknown>> = []
    for (const node of nodes.slice(0, limit)) {
      const record: Record<string, unknown> = {}
      if (returnFields.length === 0 || returnFields.includes(varName)) {
        record[varName] = node
      } else {
        for (const field of returnFields) {
          if (field.startsWith(varName + '.')) {
            const prop = field.substring(varName.length + 1)
            record[field] = (node as unknown as Record<string, unknown>)[prop]
          }
        }
      }
      results.push(record)
    }

    return results
  }

  private executeEdgeQuery(
    sourceVar: string,
    edgeType: string,
    targetVar: string,
    fullQuery: string,
    returnFields: string[],
    limit: number
  ): Array<Record<string, unknown>> {
    const allEdges = this.store.getAllEdges()
    const matchingEdges = allEdges.filter((e) => e.type === edgeType)

    // Apply WHERE filter on source node
    const results: Array<Record<string, unknown>> = []

    for (const edge of matchingEdges) {
      if (results.length >= limit) break

      const sourceNode = this.store.getNode(edge.source)
      const targetNode = this.store.getNode(edge.target)
      if (!sourceNode || !targetNode) continue

      // Check WHERE against source
      if (!this.matchesWhereFilter(sourceNode, sourceVar, fullQuery)) continue
      // Check WHERE against target
      if (!this.matchesWhereFilter(targetNode, targetVar, fullQuery)) continue

      const record: Record<string, unknown> = {}
      for (const field of returnFields) {
        if (field === sourceVar) record[sourceVar] = sourceNode
        else if (field === targetVar) record[targetVar] = targetNode
        else if (field.startsWith(sourceVar + '.')) {
          const prop = field.substring(sourceVar.length + 1)
          record[field] = (sourceNode as unknown as Record<string, unknown>)[prop]
        } else if (field.startsWith(targetVar + '.')) {
          const prop = field.substring(targetVar.length + 1)
          record[field] = (targetNode as unknown as Record<string, unknown>)[prop]
        }
      }
      if (returnFields.length === 0) {
        record[sourceVar] = sourceNode
        record[targetVar] = targetNode
      }
      results.push(record)
    }

    return results
  }

  private applyWhereFilter(nodes: GraphNode[], varName: string, fullQuery: string): GraphNode[] {
    return nodes.filter((node) => this.matchesWhereFilter(node, varName, fullQuery))
  }

  private matchesWhereFilter(node: GraphNode, varName: string, fullQuery: string): boolean {
    // CONTAINS
    const containsRe = new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s+CONTAINS\\s+'([^']+)'`, 'i')
    const containsMatch = containsRe.exec(fullQuery)
    if (containsMatch) {
      const prop = containsMatch[1]
      const value = containsMatch[2]
      const nodeProp = String((node as unknown as Record<string, unknown>)[prop] ?? '')
      if (!nodeProp.toLowerCase().includes(value.toLowerCase())) return false
    }

    // EQUALS
    const equalsRe = new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s*=\\s*'([^']+)'`, 'i')
    const equalsMatch = equalsRe.exec(fullQuery)
    if (equalsMatch && !containsMatch) {
      const prop = equalsMatch[1]
      const value = equalsMatch[2]
      const nodeProp = String((node as unknown as Record<string, unknown>)[prop] ?? '')
      if (nodeProp !== value) return false
    }

    // STARTS WITH
    const startsRe = new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s+STARTS\\s+WITH\\s+'([^']+)'`, 'i')
    const startsMatch = startsRe.exec(fullQuery)
    if (startsMatch) {
      const prop = startsMatch[1]
      const value = startsMatch[2]
      const nodeProp = String((node as unknown as Record<string, unknown>)[prop] ?? '')
      if (!nodeProp.toLowerCase().startsWith(value.toLowerCase())) return false
    }

    return true
  }
}
