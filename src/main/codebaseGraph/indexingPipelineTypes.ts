/**
 * indexingPipelineTypes.ts — Type definitions for the multi-pass indexing pipeline.
 *
 * Defines the options, progress reporting, result, and per-file tracking types
 * used by IndexingPipeline to orchestrate project indexing.
 */

import type { ParsedFileResult } from './treeSitterTypes'

// ─── Indexing options ─────────────────────────────────────────────────────────

export interface IndexingOptions {
  projectRoot: string           // Absolute path
  projectName?: string          // Override auto-detected name
  incremental?: boolean         // Only reindex changed files (default true)
  maxFileSize?: number          // Skip files larger than this (default 512KB)
  maxFiles?: number             // Safety cap (default 10000)
  ignorePaths?: string[]        // Additional ignore patterns
  onProgress?: (progress: IndexingProgress) => void
}

// ─── Progress reporting ───────────────────────────────────────────────────────

export interface IndexingProgress {
  phase: string                 // Current pass name
  filesTotal: number
  filesProcessed: number
  nodesCreated: number
  edgesCreated: number
  errors: string[]
  startedAt: number
  elapsedMs: number
}

// ─── Indexing result ──────────────────────────────────────────────────────────

export interface IndexingResult {
  projectName: string
  success: boolean
  filesIndexed: number
  filesSkipped: number
  nodesCreated: number
  edgesCreated: number
  errors: string[]
  durationMs: number
  incremental: boolean          // Was this an incremental reindex?
  phaseTimingsMs?: Record<string, number>  // per-pass wall-clock time (ms)
}

// ─── Discovered file (from directory walk) ────────────────────────────────────

export interface DiscoveredFile {
  absolutePath: string
  relativePath: string          // Relative to project root, forward slashes
  extension: string             // Without dot
  sizeBytes: number
  mtimeMs: number
}

// ─── Indexed file (after parse + hash) ────────────────────────────────────────

export interface IndexedFile extends DiscoveredFile {
  contentHash: string
  parsed: ParsedFileResult | null   // null if unsupported language or parse error
}
