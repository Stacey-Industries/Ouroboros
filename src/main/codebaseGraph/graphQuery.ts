/**
 * graphQuery.ts — Query engine for search, trace, and structural analysis.
 */

import fs from 'fs/promises';
import path from 'path';

import log from '../logger';
import { buildFileTree, buildHotspots, buildModules } from './graphQueryArchitecture';
import { executeCypherLike, matchesWhereFilter } from './graphQuerySupport';
import type { GraphStore } from './graphStore';
import type {
  ArchitectureView,
  CallPathResult,
  ChangeDetectionResult,
  CodeSnippetResult,
  GraphEdge,
  GraphNode,
  GraphSchema,
  SearchResult,
} from './graphTypes';

export class GraphQueryEngine {
  constructor(
    private store: GraphStore,
    private projectRoot: string,
  ) {}

  // --- searchGraph: fuzzy search nodes by name ---
  searchGraph(query: string, limit = 20): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    const allNodes = this.store.getAllNodes();

    for (const node of allNodes) {
      const match = this.scoreMatch(lowerQuery, node);
      if (match) results.push(match);
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private scoreMatch(lowerQuery: string, node: GraphNode): SearchResult | null {
    const lowerName = node.name.toLowerCase();
    if (lowerName === lowerQuery) return { node, score: 100, matchReason: 'exact match' };
    if (lowerName.startsWith(lowerQuery)) return { node, score: 80, matchReason: 'prefix match' };
    if (lowerName.includes(lowerQuery)) return { node, score: 60, matchReason: 'substring match' };
    if (this.fuzzyMatch(lowerQuery, lowerName))
      return { node, score: 40, matchReason: 'fuzzy match' };
    return null;
  }

  private fuzzyMatch(query: string, target: string): boolean {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      // eslint-disable-next-line security/detect-object-injection -- qi/ti are numeric loop indices into strings
      if (query[qi] === target[ti]) qi++;
    }
    return qi === query.length;
  }

  // --- searchCode: regex search across files ---
  async searchCode(
    pattern: string,
    opts?: { fileGlob?: string; maxResults?: number },
  ): Promise<Array<{ filePath: string; line: number; match: string }>> {
    const maxResults = opts?.maxResults ?? 100;
    const results: Array<{ filePath: string; line: number; match: string }> = [];

    let regex: RegExp;
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- pattern is user-provided search query, used only for matching
      regex = new RegExp(pattern, 'gi');
    } catch {
      return results;
    }

    const fileNodes = this.store.getNodesByType('file');
    const fileGlob = opts?.fileGlob;

    for (const fileNode of fileNodes) {
      if (results.length >= maxResults) break;
      if (fileGlob && !this.matchGlob(fileNode.filePath, fileGlob)) continue;
      await this.searchFileLines(fileNode.filePath, regex, maxResults, results);
    }

    return results;
  }

  private async searchFileLines(
    filePath: string,
    regex: RegExp,
    maxResults: number,
    results: Array<{ filePath: string; line: number; match: string }>,
  ): Promise<void> {
    const fullPath = path.join(this.projectRoot, filePath);
    let content: string;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from indexed project files
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      return;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
      regex.lastIndex = 0;
      // eslint-disable-next-line security/detect-object-injection -- i is a numeric loop index
      if (regex.test(lines[i])) {
        // eslint-disable-next-line security/detect-object-injection -- i is a numeric loop index
        results.push({ filePath, line: i + 1, match: lines[i].trim() });
      }
    }
  }

  private matchGlob(filePath: string, glob: string): boolean {
    const regexStr = glob
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- glob is from caller's file filter, bounded input
      const fullRe = new RegExp(`^${regexStr}$`);
      // eslint-disable-next-line security/detect-non-literal-regexp -- glob is from caller's file filter, bounded input
      const partialRe = new RegExp(regexStr);
      return fullRe.test(filePath) || partialRe.test(filePath);
    } catch {
      return false;
    }
  }

  // --- traceCallPath: BFS between two symbols ---
  traceCallPath(fromId: string, toId: string, maxDepth = 10): CallPathResult {
    const fromNode = this.store.getNode(fromId);
    const toNode = this.store.getNode(toId);
    if (!fromNode || !toNode) return { found: false, path: [], edges: [] };

    return this.bfsTracePath(fromId, toId, maxDepth);
  }

  private bfsTracePath(fromId: string, toId: string, maxDepth: number): CallPathResult {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[]; edges: GraphEdge[] }> = [
      { nodeId: fromId, path: [fromId], edges: [] },
    ];
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.path.length > maxDepth + 1) continue;

      if (current.nodeId === toId) {
        return this.buildCallPathResult(current.path, current.edges);
      }

      this.enqueueOutEdges(current, visited, queue);
    }

    return { found: false, path: [], edges: [] };
  }

  private buildCallPathResult(pathIds: string[], edges: GraphEdge[]): CallPathResult {
    const pathNodes = pathIds
      .map((id) => this.store.getNode(id))
      .filter((n): n is GraphNode => n !== undefined);
    return { found: true, path: pathNodes, edges };
  }

  private enqueueOutEdges(
    current: { nodeId: string; path: string[]; edges: GraphEdge[] },
    visited: Set<string>,
    queue: Array<{ nodeId: string; path: string[]; edges: GraphEdge[] }>,
  ): void {
    const traverseTypes = new Set(['calls', 'imports', 'depends_on', 'contains']);
    const outEdges = this.store.getEdgesFrom(current.nodeId);
    for (const edge of outEdges) {
      if (visited.has(edge.target)) continue;
      if (traverseTypes.has(edge.type)) {
        visited.add(edge.target);
        queue.push({
          nodeId: edge.target,
          path: [...current.path, edge.target],
          edges: [...current.edges, edge],
        });
      }
    }
  }

  // --- getArchitecture: structural overview ---
  getArchitecture(aspects?: string[]): ArchitectureView {
    const showAll = !aspects || aspects.length === 0;
    const showModules = showAll || aspects!.includes('modules');
    const showHotspots = showAll || aspects!.includes('hotspots');
    const showFileTree = showAll || aspects!.includes('file_tree');

    return {
      projectName: path.basename(this.projectRoot),
      modules: showModules ? buildModules(this.store) : [],
      hotspots: showHotspots ? buildHotspots(this.store) : [],
      fileTree: showFileTree ? buildFileTree(this.store) : [],
    };
  }

  // --- getCodeSnippet: source + context for a symbol ---
  async getCodeSnippet(symbolId: string): Promise<CodeSnippetResult | null> {
    const node = this.store.getNode(symbolId);
    if (!node) return null;

    const content = await this.readSnippetContent(node);
    const dependencies = this.store
      .getEdgesFrom(symbolId)
      .map((e) => this.store.getNode(e.target)?.name)
      .filter((n): n is string => n !== undefined);
    const dependents = this.store
      .getEdgesTo(symbolId)
      .map((e) => this.store.getNode(e.source)?.name)
      .filter((n): n is string => n !== undefined);

    return { node, content, dependencies, dependents };
  }

  private async readSnippetContent(node: GraphNode): Promise<string> {
    const fullPath = path.join(this.projectRoot, node.filePath);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from indexed project files
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n');
      const startLine = Math.max(0, node.line - 1);
      const endLine = node.endLine ?? startLine + 30;
      return lines.slice(startLine, Math.min(lines.length, endLine)).join('\n');
    } catch {
      return '';
    }
  }

  // --- detectChanges: compare fs against indexed state ---
  async detectChanges(): Promise<ChangeDetectionResult> {
    const fileNodes = this.store.getNodesByType('file');
    const changedFiles: string[] = [];
    const affectedSymbols: GraphNode[] = [];

    for (const fileNode of fileNodes) {
      const changed = await this.checkFileChanged(fileNode);
      if (changed) {
        changedFiles.push(fileNode.filePath);
        const symbols = this.store.getNodesByFile(fileNode.filePath);
        affectedSymbols.push(...symbols.filter((s) => s.type !== 'file'));
      }
    }

    const blastRadius = this.computeBlastRadius(affectedSymbols);
    return { changedFiles, affectedSymbols, blastRadius };
  }

  private async checkFileChanged(fileNode: GraphNode): Promise<boolean> {
    const fullPath = path.join(this.projectRoot, fileNode.filePath);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from indexed project files
      const stat = await fs.stat(fullPath);
      const lastIndexed = (fileNode.metadata?.mtime as number) ?? 0;
      return stat.mtimeMs > lastIndexed;
    } catch {
      return true; // File deleted
    }
  }

  private computeBlastRadius(affectedSymbols: GraphNode[]): number {
    const affectedIds = new Set(affectedSymbols.map((s) => s.id));
    let blastRadius = affectedIds.size;
    for (const sym of affectedSymbols) {
      const dependents = this.store.getEdgesTo(sym.id);
      for (const dep of dependents) {
        if (!affectedIds.has(dep.source)) {
          blastRadius++;
          affectedIds.add(dep.source);
        }
      }
    }
    return blastRadius;
  }

  // --- getGraphSchema: describe the graph structure ---
  getGraphSchema(): GraphSchema {
    const nodeTypes = new Set<string>();
    const edgeTypes = new Set<string>();
    for (const node of this.store.getAllNodes()) nodeTypes.add(node.type);
    for (const edge of this.store.getAllEdges()) edgeTypes.add(edge.type);
    return {
      nodeTypes: Array.from(nodeTypes),
      edgeTypes: Array.from(edgeTypes),
      nodeCount: this.store.nodeCount(),
      edgeCount: this.store.edgeCount(),
    };
  }

  // --- queryGraph: simple Cypher-like query ---
  queryGraph(query: string): Array<Record<string, unknown>> {
    try {
      return executeCypherLike(query, this.store, matchesWhereFilter);
    } catch (err) {
      log.warn('Query parse error:', err);
      return [];
    }
  }
}
