/**
 * graphStore.ts — In-memory graph store with JSON persistence.
 */

import fs from 'fs/promises'
import path from 'path'
import type { GraphNode, GraphEdge } from './graphTypes'

export class GraphStore {
  private nodes = new Map<string, GraphNode>()
  private edges: GraphEdge[] = []
  private persistPath: string

  constructor(projectRoot: string) {
    this.persistPath = path.join(projectRoot, '.ouroboros', 'graph.json')
  }

  // --- Node CRUD ---

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node)
  }

  removeNode(id: string): void {
    this.nodes.delete(id)
    this.edges = this.edges.filter((e) => e.source !== id && e.target !== id)
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id)
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  getNodesByType(type: GraphNode['type']): GraphNode[] {
    const result: GraphNode[] = []
    for (const node of this.nodes.values()) {
      if (node.type === type) result.push(node)
    }
    return result
  }

  getNodesByFile(filePath: string): GraphNode[] {
    const result: GraphNode[] = []
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) result.push(node)
    }
    return result
  }

  // --- Edge CRUD ---

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge)
  }

  removeEdgesForNode(nodeId: string): void {
    this.edges = this.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
  }

  removeEdgesForFile(filePath: string): void {
    const nodeIds = new Set<string>()
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) nodeIds.add(node.id)
    }
    this.edges = this.edges.filter((e) => !nodeIds.has(e.source) && !nodeIds.has(e.target))
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.source === nodeId)
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.target === nodeId)
  }

  getAllEdges(): GraphEdge[] {
    return this.edges.slice()
  }

  // --- Bulk operations ---

  clearFile(filePath: string): void {
    this.removeEdgesForFile(filePath)
    const toRemove: string[] = []
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) toRemove.push(node.id)
    }
    for (const id of toRemove) {
      this.nodes.delete(id)
    }
  }

  // --- Persistence ---

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath)
      await fs.mkdir(dir, { recursive: true })
      const data = {
        nodes: Array.from(this.nodes.values()),
        edges: this.edges,
      }
      await fs.writeFile(this.persistPath, JSON.stringify(data), 'utf-8')
    } catch (err) {
      console.warn('[graph-store] Failed to persist graph:', err)
    }
  }

  async load(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.persistPath, 'utf-8')
      const data = JSON.parse(raw) as { nodes: GraphNode[]; edges: GraphEdge[] }
      this.nodes.clear()
      for (const node of data.nodes) {
        this.nodes.set(node.id, node)
      }
      this.edges = data.edges ?? []
      return true
    } catch {
      return false
    }
  }

  // --- Stats ---

  nodeCount(): number {
    return this.nodes.size
  }

  edgeCount(): number {
    return this.edges.length
  }

  fileCount(): number {
    const files = new Set<string>()
    for (const node of this.nodes.values()) {
      files.add(node.filePath)
    }
    return files.size
  }

  clear(): void {
    this.nodes.clear()
    this.edges = []
  }
}
