/**
 * graphWorkerTypes.ts — Shared message types for main ↔ worker communication.
 * Plain JSON-safe types only — no WASM objects, no class instances.
 */

import type { GraphEdge, GraphNode } from './graphTypes';

// ── Main → Worker ─────────────────────────────────────────────────

export type WorkerRequest =
  | IndexAllRequest
  | ReindexFilesRequest
  | ReindexSingleRequest;

export interface IndexAllRequest {
  type: 'indexAll';
  projectRoot: string;
  projectName: string;
  incremental: boolean;
}

export interface ReindexFilesRequest {
  type: 'reindexFiles';
  projectRoot: string;
  projectName: string;
  paths: string[];
}

export interface ReindexSingleRequest {
  type: 'reindexSingle';
  projectRoot: string;
  fullPath: string;
}

// ── Worker → Main ─────────────────────────────────────────────────

export type WorkerResponse =
  | IndexCompleteResponse
  | ReindexCompleteResponse
  | WorkerErrorResponse
  | WorkerProgressResponse
  | WorkerReadyResponse;

export interface WorkerReadyResponse {
  type: 'ready';
}

export interface IndexCompleteResponse {
  type: 'indexComplete';
  nodes: GraphNode[];
  edges: GraphEdge[];
  durationMs: number;
}

export interface ReindexCompleteResponse {
  type: 'reindexComplete';
  nodes: GraphNode[];
  edges: GraphEdge[];
  removedRelPaths: string[];
}

export interface WorkerErrorResponse {
  type: 'error';
  message: string;
  requestType: string;
}

export interface WorkerProgressResponse {
  type: 'progress';
  filesProcessed: number;
  totalFiles: number;
}
