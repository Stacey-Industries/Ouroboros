/**
 * indexingWorkerTypes.ts — Discriminated-union message types for
 * main-process ↔ indexing-worker communication.
 *
 * All values must be plain JSON-serialisable — no class instances,
 * no WASM objects, no Buffer/ArrayBuffer.
 */

import type { IndexingOptions, IndexingProgress, IndexingResult } from './indexingPipelineTypes'

// ── Main → Worker ────────────────────────────────────────────────────────────

/** Stripped options sent across the thread boundary (onProgress omitted — it is
 *  a function and cannot be serialised; progress comes back via WorkerProgress). */
export type IndexRequestOptions = Omit<IndexingOptions, 'onProgress'>

export interface IndexRepositoryRequest {
  type: 'indexRepository'
  requestId: string
  options: IndexRequestOptions
}

export type IndexingWorkerRequest = IndexRepositoryRequest

// ── Worker → Main ────────────────────────────────────────────────────────────

export interface WorkerProgressMessage {
  type: 'progress'
  requestId: string
  progress: IndexingProgress
}

export interface WorkerResultMessage {
  type: 'result'
  requestId: string
  result: IndexingResult
}

export interface WorkerErrorMessage {
  type: 'error'
  requestId: string
  message: string
  stack?: string
}

export type IndexingWorkerResponse =
  | WorkerProgressMessage
  | WorkerResultMessage
  | WorkerErrorMessage
