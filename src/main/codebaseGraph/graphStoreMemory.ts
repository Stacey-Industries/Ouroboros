/**
 * graphStoreMemory.ts — In-memory graph store for worker thread use.
 *
 * Extracted from the original graphStore.ts. Used by graphWorker.ts as a
 * scratch pad during indexing — the worker builds up nodes/edges in memory,
 * then sends the results to the main thread via postMessage.
 *
 * The main-thread production store is GraphStoreSqlite (in graphStore.ts).
 */

import fs from 'fs/promises';
import path from 'path';

import log from '../logger';
import type { IGraphStore } from './graphStoreTypes';
import type { GraphEdge, GraphNode } from './graphTypes';

export class GraphStoreMemory implements IGraphStore {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private persistPath: string;

  constructor(projectRoot: string) {
    this.persistPath = path.join(
      projectRoot, '.ouroboros', 'graph.json',
    );
  }

  // --- Node CRUD ---

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    this.edges = this.edges.filter(
      (e) => e.source !== id && e.target !== id,
    );
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getNodesByType(type: GraphNode['type']): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) result.push(node);
    }
    return result;
  }

  getNodesByFile(filePath: string): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) result.push(node);
    }
    return result;
  }

  // --- Edge CRUD ---

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }

  removeEdgesForNode(nodeId: string): void {
    this.edges = this.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    );
  }

  removeEdgesForFile(filePath: string): void {
    const nodeIds = new Set<string>();
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) nodeIds.add(node.id);
    }
    this.edges = this.edges.filter(
      (e) => !nodeIds.has(e.source) && !nodeIds.has(e.target),
    );
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.source === nodeId);
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.target === nodeId);
  }

  getAllEdges(): GraphEdge[] {
    return this.edges.slice();
  }

  replaceAllEdges(edges: GraphEdge[]): void {
    this.edges = edges;
  }

  // --- Bulk operations ---

  addBulk(nodes: GraphNode[], edges: GraphEdge[]): void {
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }
    for (const edge of edges) {
      this.edges.push(edge);
    }
  }

  clearFile(filePath: string): void {
    this.removeEdgesForFile(filePath);
    const toRemove: string[] = [];
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) toRemove.push(node.id);
    }
    for (const id of toRemove) {
      this.nodes.delete(id);
    }
  }

  // --- Persistence ---

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(dir, { recursive: true });
      const data = {
        nodes: Array.from(this.nodes.values()),
        edges: this.edges,
      };
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(
        this.persistPath, JSON.stringify(data), 'utf-8',
      );
    } catch (err) {
      log.warn('Failed to persist graph:', err);
    }
  }

  async load(): Promise<boolean> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const raw = await fs.readFile(this.persistPath, 'utf-8');
      const data = JSON.parse(raw) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      };
      this.nodes.clear();
      for (const node of data.nodes) {
        this.nodes.set(node.id, node);
      }
      this.edges = data.edges ?? [];
      return true;
    } catch {
      return false;
    }
  }

  // --- Stats ---

  nodeCount(): number {
    return this.nodes.size;
  }

  edgeCount(): number {
    return this.edges.length;
  }

  fileCount(): number {
    const files = new Set<string>();
    for (const node of this.nodes.values()) {
      files.add(node.filePath);
    }
    return files.size;
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
  }

  close(): void {
    // No-op for in-memory store.
  }

  /** No-op — in-memory store has no transaction semantics. */
  transaction<T>(fn: () => T): T {
    return fn();
  }
}
