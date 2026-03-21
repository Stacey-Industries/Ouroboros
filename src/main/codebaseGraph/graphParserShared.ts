/**
 * graphParserShared.ts — Shared utilities for graph parser sub-modules.
 */

import path from 'path';
import type TreeSitterModule from 'web-tree-sitter';

import type { GraphEdge, GraphNode } from './graphTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git', '.ouroboros', '.claude', '.context']);
export const MAX_FILE_SIZE = 500 * 1024; // 500KB

export const BUILTIN_CALLEES = new Set([
  'console',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Promise',
  'JSON',
  'Math',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Symbol',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'encodeURI',
  'decodeURI',
  'require',
  'import',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'Buffer',
  'process',
  'global',
  'globalThis',
  'window',
  'document',
  'fetch',
  'Response',
  'Request',
  'Headers',
  'URL',
  'URLSearchParams',
  'alert',
  'confirm',
  'prompt',
  'queueMicrotask',
  'structuredClone',
  'super',
  'this',
]);

export const TS_FUNCTION_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
]);

export const TS_CLASS_TYPES = new Set(['class_declaration', 'abstract_class_declaration']);

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ParseResultWithTree extends ParseResult {
  tree: TreeSitterModule.Tree | null;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function makeNodeId(filePath: string, name: string, type: string, line: number): string {
  return `${filePath}::${name}::${type}::${line}`;
}

export function resolveImportPath(
  importSpec: string,
  currentFile: string,
  projectRoot: string,
): string | null {
  if (!importSpec.startsWith('.')) return null;
  const dir = path.dirname(currentFile);
  let resolved = path.resolve(dir, importSpec);
  resolved = path.relative(projectRoot, resolved).replace(/\\/g, '/');
  return resolved;
}

/**
 * Find all descendant nodes of a given type using a tree cursor walk.
 * Replaces the non-existent `node.descendantsOfType()` in web-tree-sitter.
 */
export function findDescendantsOfType(
  node: TreeSitterModule.Node,
  type: string,
): TreeSitterModule.Node[] {
  const results: TreeSitterModule.Node[] = [];
  const cursor = node.walk();
  let reachedRoot = false;
  while (!reachedRoot) {
    if (cursor.nodeType === type) results.push(cursor.currentNode);
    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;
    while (true) {
      if (!cursor.gotoParent()) {
        reachedRoot = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }
  return results;
}

/**
 * Create a file-level graph node.
 */
export function createFileNode(relPath: string): { fileNodeId: string; fileNode: GraphNode } {
  const fileNodeId = makeNodeId(relPath, path.basename(relPath), 'file', 0);
  const fileNode: GraphNode = {
    id: fileNodeId,
    type: 'file',
    name: path.basename(relPath),
    filePath: relPath,
    line: 0,
  };
  return { fileNodeId, fileNode };
}

/**
 * Context object for symbol extraction to reduce parameter count.
 */
export interface SymbolExtractionContext {
  relPath: string;
  filePath: string;
  projectRoot: string;
  fileNodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  seenIds: Set<string>;
}

/**
 * Add a symbol node and its containment edge.
 */
export function addSymbolToContext(
  ctx: SymbolExtractionContext,
  opts: {
    name: string;
    type: GraphNode['type'];
    line: number;
    endLine: number;
    isExported: boolean;
  },
): string {
  const nodeId = makeNodeId(ctx.relPath, opts.name, opts.type, opts.line);
  if (ctx.seenIds.has(nodeId)) return nodeId;
  ctx.seenIds.add(nodeId);
  ctx.nodes.push({
    id: nodeId,
    type: opts.type,
    name: opts.name,
    filePath: ctx.relPath,
    line: opts.line,
    endLine: opts.endLine,
  });
  ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
  if (opts.isExported) {
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
  }
  return nodeId;
}
