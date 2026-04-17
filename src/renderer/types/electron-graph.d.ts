/**
 * electron-graph.d.ts — IPC types for the codebase knowledge graph.
 *
 * Mirrors the main-process handler shapes in graphHandlers.ts.
 * Uses only existing graph:searchGraph and graph:getArchitecture channels.
 */

import type { IpcResult } from './electron-foundation';

// ── Shared node/edge types (mirrors graphTypes.ts) ──────────────────────────

export type GraphNodeType =
  | 'file'
  | 'function'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'variable'
  | 'module'
  | 'export';

export interface RawGraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  filePath: string;
  line: number;
  endLine?: number;
  metadata?: Record<string, unknown>;
}

export interface RawGraphEdge {
  source: string;
  target: string;
  type: 'imports' | 'exports' | 'calls' | 'contains' | 'implements' | 'extends' | 'depends_on';
  metadata?: Record<string, unknown>;
}

// ── Result shapes ─────────────────────────────────────────────────────────────

export interface GraphSearchItem {
  node: RawGraphNode;
  score: number;
  matchReason: string;
}

export interface GraphSearchResult extends IpcResult {
  results?: GraphSearchItem[];
}

export interface ArchitectureModule {
  name: string;
  rootPath: string;
  fileCount: number;
  exports: string[];
}

export interface ArchitectureHotspot {
  filePath: string;
  inDegree: number;
  outDegree: number;
}

export interface ArchitectureFileEntry {
  path: string;
  type: 'file' | 'directory';
  children?: string[];
}

export interface ArchitectureData {
  projectName: string;
  modules: ArchitectureModule[];
  hotspots: ArchitectureHotspot[];
  fileTree: ArchitectureFileEntry[];
}

export interface GraphArchitectureResult extends IpcResult {
  architecture?: ArchitectureData;
}

export interface GraphStatusResult extends IpcResult {
  status?: {
    initialized: boolean;
    projectRoot: string;
    projectName: string;
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    lastIndexedAt: number;
    indexDurationMs: number;
  };
}

// ── Neighbourhood result shapes ───────────────────────────────────────────────

export interface GraphNeighbourhoodResult extends IpcResult {
  symbol?: RawGraphNode;
  callers?: RawGraphNode[];
  callees?: RawGraphNode[];
  imports?: RawGraphNode[];
}

// ── Blast-radius result shapes ────────────────────────────────────────────────

export type BlastRadiusCriticality = 'critical' | 'high' | 'medium' | 'low';

export interface BlastRadiusEntry {
  node: RawGraphNode;
  distance: number;
  criticality: BlastRadiusCriticality;
}

export interface GraphBlastRadiusResult extends IpcResult {
  symbol?: RawGraphNode;
  affectedSymbols?: BlastRadiusEntry[];
}

// ── @symbol: bare-form disambiguation result ──────────────────────────────────

export interface SymbolDisambiguationItem {
  /** Full pinned-context key: @symbol:filePath::name::line */
  key: string;
  name: string;
  type: string;
  filePath: string;
  line: number;
  endLine?: number;
}

export interface SymbolDisambiguationResult extends IpcResult {
  items?: SymbolDisambiguationItem[];
}

// ── API surface ───────────────────────────────────────────────────────────────

export interface GraphAPI {
  searchGraph: (query: string, limit?: number) => Promise<GraphSearchResult>;
  getArchitecture: (aspects?: string[]) => Promise<GraphArchitectureResult>;
  getStatus: () => Promise<GraphStatusResult>;
  getNeighbourhood: (symbolId: string, depth?: number) => Promise<GraphNeighbourhoodResult>;
  getBlastRadius: (symbolId: string, depth?: number) => Promise<GraphBlastRadiusResult>;
}
