/**
 * graphParser.ts — Public API for file parsing and graph construction.
 * Delegates to sub-modules for AST extraction, regex fallback, and generic languages.
 */

import fs from 'fs/promises';
import path from 'path';
import type TreeSitterModule from 'web-tree-sitter';

import { extractSymbolsFromTree } from './graphParserAst';
import { extractCallEdges } from './graphParserCallGraph';
import { extractSymbolsGeneric, LANGUAGE_CONFIGS } from './graphParserGeneric';
import { parseFileRegex } from './graphParserRegex';
import {
  makeNodeId,
  MAX_FILE_SIZE,
  type ParseResult,
  type ParseResultWithTree,
  SKIP_DIRS,
} from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';
import {
  createParserForFile,
  getGrammarForExtension,
  getSupportedExtensions,
  initTreeSitter,
} from './treeSitterLoader';

// Re-export for external consumers
export { initTreeSitter };

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a single file and return graph nodes and edges.
 * Uses tree-sitter when available for supported file types, falls back to regex.
 */
export async function parseFile(filePath: string, projectRoot: string): Promise<ParseResult> {
  const result = await parseFileWithTree(filePath, projectRoot);
  if (result.tree) {
    result.tree.delete();
  }
  return { nodes: result.nodes, edges: result.edges };
}

/**
 * Parse a file and return the tree-sitter Tree along with nodes/edges.
 * Caller is responsible for calling tree.delete() when done.
 * Returns tree: null when regex fallback was used.
 */
export async function parseFileWithTree(
  filePath: string,
  projectRoot: string,
  oldTree?: TreeSitterModule.Tree,
): Promise<ParseResultWithTree> {
  const ext = path.extname(filePath).toLowerCase();
  const grammarName = getGrammarForExtension(ext);

  if (!grammarName) {
    const result = await parseFileRegex(filePath, projectRoot);
    return { ...result, tree: null };
  }

  const parser = await tryCreateParser(filePath);
  if (!parser) {
    const result = await parseFileRegex(filePath, projectRoot);
    return { ...result, tree: null };
  }

  return parseWithTreeSitter({ filePath, projectRoot, parser, grammarName, oldTree });
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

interface TreeSitterParseOpts {
  filePath: string;
  projectRoot: string;
  parser: TreeSitterModule.Parser;
  grammarName: string;
  oldTree?: TreeSitterModule.Tree;
}

async function tryCreateParser(filePath: string): Promise<TreeSitterModule.Parser | null> {
  try {
    return await createParserForFile(filePath);
  } catch {
    return null;
  }
}

async function parseWithTreeSitter(opts: TreeSitterParseOpts): Promise<ParseResultWithTree> {
  const { filePath, projectRoot, parser, grammarName, oldTree } = opts;
  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  let content: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    parser.delete();
    return { nodes: [], edges: [], tree: null };
  }

  const tree = parser.parse(content, oldTree);
  parser.delete();

  if (!tree) {
    return { nodes: [], edges: [], tree: null };
  }

  const result = routeExtractor({ tree, relPath, filePath, projectRoot, grammarName });
  return { ...result, tree };
}

interface RouteExtractorOpts {
  tree: TreeSitterModule.Tree;
  relPath: string;
  filePath: string;
  projectRoot: string;
  grammarName: string;
}

function routeExtractor(opts: RouteExtractorOpts): ParseResult {
  const { tree, relPath, filePath, projectRoot, grammarName } = opts;
  const isTypeScript =
    grammarName === 'tree-sitter-typescript' || grammarName === 'tree-sitter-tsx';
  const isJavaScript = grammarName === 'tree-sitter-javascript';

  if (isTypeScript || isJavaScript) {
    const result = extractSymbolsFromTree({ tree, relPath, filePath, projectRoot });
    const callEdges = extractCallEdges(tree, result.nodes, relPath);
    result.edges.push(...callEdges);
    return result;
  }

  // eslint-disable-next-line security/detect-object-injection
  const config = LANGUAGE_CONFIGS[grammarName];
  if (config) {
    return extractSymbolsGeneric({ tree, relPath, filePath, projectRoot, config });
  }

  // Supported grammar but no config — just create a file node
  const fileNodeId = makeNodeId(relPath, path.basename(relPath), 'file', 0);
  return {
    nodes: [
      { id: fileNodeId, type: 'file', name: path.basename(relPath), filePath: relPath, line: 0 },
    ],
    edges: [],
  };
}

// ─── Directory Walking ───────────────────────────────────────────────────────

/**
 * Walk a directory recursively, yielding file paths for parseable files.
 */
export async function walkDirectory(dir: string): Promise<string[]> {
  const supportedExts = getSupportedExtensions();
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    supportedExts.add(ext);
  }

  const results: string[] = [];
  await walkDirectoryRecursive(dir, supportedExts, results);
  return results;
}

async function walkDirectoryRecursive(
  currentDir: string,
  supportedExts: Set<string>,
  results: string[],
): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await walkDirectoryRecursive(fullPath, supportedExts, results);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!supportedExts.has(ext)) continue;
    await addIfUnderSizeLimit(fullPath, results);
  }
}

async function addIfUnderSizeLimit(fullPath: string, results: string[]): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stat = await fs.stat(fullPath);
    if (stat.size <= MAX_FILE_SIZE) {
      results.push(fullPath);
    }
  } catch {
    // skip inaccessible files
  }
}

// ─── Edge Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve __file:: and __unresolved:: references in edges to actual node IDs.
 */
export function resolveEdgeReferences(allNodes: GraphNode[], allEdges: GraphEdge[]): GraphEdge[] {
  const { fileNodeIdByRelPath, nodesByName } = buildResolutionMaps(allNodes);
  return allEdges.map((edge) => resolveEdge(edge, fileNodeIdByRelPath, nodesByName));
}

function buildResolutionMaps(allNodes: GraphNode[]): {
  fileNodeIdByRelPath: Map<string, string>;
  nodesByName: Map<string, GraphNode[]>;
} {
  const fileNodeIdByRelPath = new Map<string, string>();
  const nodesByName = new Map<string, GraphNode[]>();

  for (const node of allNodes) {
    if (node.type === 'file') {
      fileNodeIdByRelPath.set(node.filePath, node.id);
      const noExt = node.filePath.replace(/\.\w+$/, '');
      fileNodeIdByRelPath.set(noExt, node.id);
      const noIndex = noExt.replace(/\/index$/, '');
      if (noIndex !== noExt) fileNodeIdByRelPath.set(noIndex, node.id);
    }
    const existing = nodesByName.get(node.name) ?? [];
    existing.push(node);
    nodesByName.set(node.name, existing);
  }

  return { fileNodeIdByRelPath, nodesByName };
}

function resolveEdge(
  edge: GraphEdge,
  fileMap: Map<string, string>,
  nameMap: Map<string, GraphNode[]>,
): GraphEdge {
  if (edge.target.startsWith('__file::')) {
    return resolveFileEdge(edge, fileMap);
  }
  if (edge.target.startsWith('__unresolved::')) {
    return resolveUnresolvedEdge(edge, nameMap);
  }
  return edge;
}

function resolveFileEdge(edge: GraphEdge, fileMap: Map<string, string>): GraphEdge {
  const relPath = edge.target.substring('__file::'.length);
  const resolved = fileMap.get(relPath) ?? fileMap.get(relPath.replace(/\\/g, '/'));
  return resolved ? { ...edge, target: resolved } : edge;
}

function resolveUnresolvedEdge(edge: GraphEdge, nameMap: Map<string, GraphNode[]>): GraphEdge {
  const parts = edge.target.substring('__unresolved::'.length).split('::');
  const name = parts[0];
  const candidates = nameMap.get(name);
  if (!candidates || candidates.length === 0) return edge;
  const preferredType = parts[1] ?? 'class';
  const best = candidates.find((c) => c.type === preferredType) ?? candidates[0];
  return { ...edge, target: best.id };
}
