/**
 * graphIndexing.ts — Extracted indexing logic for the codebase graph.
 * Handles full indexing, incremental reindexing, and tree cache management.
 */

import fs from 'fs/promises';
import path from 'path';
import type TreeSitterModule from 'web-tree-sitter';

import log from '../logger';
import { parseFileWithTree, resolveEdgeReferences, walkDirectory } from './graphParser';
import type { GraphQueryEngine } from './graphQuery';
import type { GraphStore } from './graphStore';
import type { GraphNode } from './graphTypes';

const TREE_CACHE_MAX = 200;

// ── mtime stamping ─────────────────────────────────────────────────

async function stampFileNodeMtime(filePath: string, nodes: GraphNode[]): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stat = await fs.stat(filePath);
    for (const node of nodes) {
      if (node.type === 'file') {
        node.metadata = { ...node.metadata, mtime: stat.mtimeMs };
      }
    }
  } catch {
    // stat failed, continue without mtime
  }
}

// ── Tree cache ─────────────────────────────────────────────────────

export class TreeCache {
  private cache = new Map<string, TreeSitterModule.Tree>();

  get(relPath: string): TreeSitterModule.Tree | undefined {
    return this.cache.get(relPath);
  }

  set(relPath: string, tree: TreeSitterModule.Tree): void {
    this.evict(relPath);
    if (this.cache.size >= TREE_CACHE_MAX) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.evict(firstKey);
    }
    this.cache.set(relPath, tree);
  }

  evict(relPath: string): void {
    const existing = this.cache.get(relPath);
    if (existing) {
      try {
        existing.delete();
      } catch {
        /* already freed */
      }
      this.cache.delete(relPath);
    }
  }

  freeAll(): void {
    for (const tree of this.cache.values()) {
      try {
        tree.delete();
      } catch {
        /* already freed */
      }
    }
    this.cache.clear();
  }
}

// ── Indexing helpers ────────────────────────────────────────────────

export interface IndexContext {
  store: GraphStore;
  treeCache: TreeCache;
  rootPath: string;
}

async function parseSingleFile(
  ctx: IndexContext,
  filePath: string,
  projectRoot: string,
): Promise<{ nodes: GraphNode[]; edges: Array<{ source: string; target: string; type: string }> }> {
  const result = await parseFileWithTree(filePath, projectRoot);
  if (result.tree) {
    const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    ctx.treeCache.set(relPath, result.tree);
  }
  await stampFileNodeMtime(filePath, result.nodes);
  return { nodes: result.nodes, edges: result.edges };
}

export async function indexAllFiles(
  ctx: IndexContext,
  projectRoot: string,
  incremental: boolean,
): Promise<void> {
  if (!incremental) ctx.store.clear();

  const files = await walkDirectory(projectRoot);
  log.info(`Found ${files.length} files to index`);

  const allNodes: GraphNode[] = [];
  const allEdges: Array<{ source: string; target: string; type: string }> = [];

  for (let i = 0; i < files.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a numeric loop index
    const filePath = files[i];
    try {
      const { nodes, edges } = await parseSingleFile(ctx, filePath, projectRoot);
      allNodes.push(...nodes);
      allEdges.push(...edges);
    } catch (err) {
      log.warn(`Failed to parse ${filePath}:`, err);
    }
    // Yield the event loop every 10 files so IPC and other async work
    // can interleave. Without this, tree-sitter WASM parsing starves
    // the event loop for 10-20s on large repos.
    if (i % 10 === 9) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  const resolvedEdges = resolveEdgeReferences(allNodes, allEdges);
  for (const node of allNodes) ctx.store.addNode(node);
  for (const edge of resolvedEdges) ctx.store.addEdge(edge);
  await ctx.store.save();
}

export async function reindexSingleFile(ctx: IndexContext, fullPath: string): Promise<void> {
  try {
    await fs.access(fullPath);
  } catch {
    const relPath = path.relative(ctx.rootPath, fullPath).replace(/\\/g, '/');
    ctx.store.clearFile(relPath);
    ctx.treeCache.evict(relPath);
    return;
  }

  const relPath = path.relative(ctx.rootPath, fullPath).replace(/\\/g, '/');
  ctx.store.clearFile(relPath);

  try {
    const oldTree = ctx.treeCache.get(relPath);
    const result = await parseFileWithTree(fullPath, ctx.rootPath, oldTree);
    if (result.tree) ctx.treeCache.set(relPath, result.tree);
    await stampFileNodeMtime(fullPath, result.nodes);
    for (const node of result.nodes) ctx.store.addNode(node);
    for (const edge of result.edges) ctx.store.addEdge(edge);
  } catch (err) {
    log.warn(`Failed to reindex ${fullPath}:`, err);
  }
}

export async function reindexChangedPaths(
  ctx: IndexContext,
  query: GraphQueryEngine,
  paths: string[],
): Promise<void> {
  const newlyCachedTrees: string[] = [];
  try {
    if (paths.length === 0) {
      const changes = await query.detectChanges();
      if (changes.changedFiles.length === 0) return;
      for (const relPath of changes.changedFiles) {
        newlyCachedTrees.push(relPath);
        await reindexSingleFile(ctx, path.join(ctx.rootPath, relPath));
      }
    } else {
      for (const filePath of paths) {
        const relPath = path.relative(ctx.rootPath, filePath).replace(/\\/g, '/');
        newlyCachedTrees.push(relPath);
        await reindexSingleFile(ctx, filePath);
      }
    }

    const allNodes = ctx.store.getAllNodes();
    const allEdges = ctx.store.getAllEdges();
    ctx.store.replaceAllEdges(resolveEdgeReferences(allNodes, allEdges));
    await ctx.store.save();
  } catch (err) {
    for (const relPath of newlyCachedTrees) ctx.treeCache.evict(relPath);
    throw err;
  }
}
