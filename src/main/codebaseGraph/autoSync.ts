/**
 * autoSync.ts — Background watcher that keeps the codebase graph in sync
 * with file changes via adaptive polling and event-driven triggers.
 *
 * Uses stat-based change detection (mtime_ns + size) rather than fs.watch
 * for cross-platform reliability. Polling interval adapts to repository size.
 */

import fs from 'fs/promises'
import path from 'path'
import type { GraphDatabase } from './graphDatabase'
import type { IndexingPipeline } from './indexingPipeline'

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AutoSyncOptions {
  projectRoot: string
  projectName: string
  db: GraphDatabase
  pipeline: IndexingPipeline
  onReindexComplete?: (result: { filesChanged: number; durationMs: number }) => void
  onError?: (error: Error) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum files to check per poll cycle to avoid blocking the event loop. */
const MAX_FILES_PER_POLL = 100

/** Debounce window for rapid change events (ms). */
const DEBOUNCE_MS = 3000

/** Threshold: if onFileChange receives more than this many paths, defer to polling. */
const IMMEDIATE_REINDEX_THRESHOLD = 5

// ─── AutoSyncWatcher ──────────────────────────────────────────────────────────

export class AutoSyncWatcher {
  private timer: ReturnType<typeof setTimeout> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private disposed = false
  private reindexing = false
  private pollIntervalMs: number

  private opts: AutoSyncOptions

  constructor(opts: AutoSyncOptions) {
    this.opts = opts

    // Adaptive poll interval based on current node count in the graph
    const fileCount = opts.db.getNodeCount(opts.projectName)
    if (fileCount < 500) {
      this.pollIntervalMs = 2_000      // 2s for small repos
    } else if (fileCount < 2_000) {
      this.pollIntervalMs = 5_000      // 5s for medium repos
    } else if (fileCount < 5_000) {
      this.pollIntervalMs = 15_000     // 15s for large repos
    } else {
      this.pollIntervalMs = 30_000     // 30s for very large repos
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Begin the polling timer loop. No-op if already running or disposed. */
  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.schedulePoll()
  }

  /** Stop the polling timer. Safe to call multiple times. */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  /** Stop polling and mark as permanently disposed. */
  dispose(): void {
    this.stop()
    this.disposed = true
  }

  // ─── Polling loop ─────────────────────────────────────────────────────────

  private schedulePoll(): void {
    if (!this.running || this.disposed) return

    this.timer = setTimeout(async () => {
      try {
        await this.pollForChanges()
      } catch (err) {
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
      this.schedulePoll()
    }, this.pollIntervalMs)
  }

  /**
   * Stat-based change detection. Iterates existing file hashes in DB,
   * compares mtime_ns and size against current fs.stat. Caps at
   * MAX_FILES_PER_POLL per cycle to avoid blocking the event loop.
   *
   * If changes are detected and no reindex is already in flight,
   * triggers an incremental reindex.
   */
  async pollForChanges(): Promise<void> {
    if (this.disposed || this.reindexing) return

    const changed: string[] = []
    let existingHashes: ReturnType<GraphDatabase['getAllFileHashes']>

    try {
      existingHashes = this.opts.db.getAllFileHashes(this.opts.projectName)
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      return
    }

    for (const record of existingHashes) {
      if (changed.length >= MAX_FILES_PER_POLL) break

      const absolutePath = path.join(this.opts.projectRoot, record.rel_path)

      try {
        const stat = await fs.stat(absolutePath)
        const currentMtimeNs = Math.floor(stat.mtimeMs * 1e6)
        const currentSize = stat.size

        // Fast stat check: if mtime_ns OR size differ, mark as changed
        if (currentMtimeNs !== record.mtime_ns || currentSize !== record.size) {
          changed.push(record.rel_path)
        }
      } catch {
        // File deleted or inaccessible -- mark as changed so reindex handles removal
        changed.push(record.rel_path)
      }
    }

    if (changed.length > 0) {
      await this.triggerReindex()
    }
  }

  // ─── Reindex triggers ─────────────────────────────────────────────────────

  /**
   * Run pipeline.index() with incremental=true. Guarded by the reindexing
   * flag to prevent concurrent runs. Errors are caught and forwarded to onError.
   */
  async triggerReindex(): Promise<void> {
    if (this.disposed || this.reindexing) return

    this.reindexing = true
    const startTime = Date.now()

    try {
      const result = await this.opts.pipeline.index({
        projectRoot: this.opts.projectRoot,
        projectName: this.opts.projectName,
        incremental: true,
      })

      if (result.success && result.filesIndexed > 0) {
        this.opts.onReindexComplete?.({
          filesChanged: result.filesIndexed,
          durationMs: Date.now() - startTime,
        })
      }
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.reindexing = false
    }
  }

  // ─── Debouncing ───────────────────────────────────────────────────────────

  /**
   * Debounced reindex with a 3-second window. Multiple rapid calls within
   * the window are coalesced into a single triggerReindex() at the end.
   */
  private debouncedReindex(): void {
    if (this.disposed) return

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.triggerReindex()
    }, DEBOUNCE_MS)
  }

  // ─── Event handlers (public, for integration) ─────────────────────────────

  /**
   * Called when specific files change (e.g., from the existing file watcher
   * infrastructure). If the change set is small (<= 5 files), triggers a
   * debounced reindex. Larger batches are deferred to the normal poll cycle.
   */
  onFileChange(relativePaths: string[]): void {
    if (this.disposed) return

    if (relativePaths.length <= IMMEDIATE_REINDEX_THRESHOLD) {
      this.debouncedReindex()
    }
    // For larger batches (e.g., build output, format-on-save), let the
    // normal polling cycle handle it to avoid redundant reindex storms.
  }

  /**
   * Called after a git commit (e.g., from the hooks server). Git commits
   * often touch many files, so we debounce rather than reindex immediately.
   */
  onGitCommit(): void {
    if (this.disposed) return
    this.debouncedReindex()
  }

  /**
   * Called when a Claude Code session starts. Triggers an immediate reindex
   * (no debounce) to ensure the graph is fresh before the session queries it.
   */
  onSessionStart(): void {
    if (this.disposed) return
    this.triggerReindex()
  }

  /**
   * Called when the workspace switches to a different project root.
   * Stops watching the old workspace, updates paths, and starts fresh.
   */
  onWorkspaceSwitch(newProjectRoot: string, newProjectName: string): void {
    if (this.disposed) return

    this.stop()
    this.opts.projectRoot = newProjectRoot
    this.opts.projectName = newProjectName

    // Recalculate adaptive poll interval for the new project
    const fileCount = this.opts.db.getNodeCount(newProjectName)
    if (fileCount < 500) {
      this.pollIntervalMs = 2_000
    } else if (fileCount < 2_000) {
      this.pollIntervalMs = 5_000
    } else if (fileCount < 5_000) {
      this.pollIntervalMs = 15_000
    } else {
      this.pollIntervalMs = 30_000
    }

    this.start()
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  /** Returns true if an incremental reindex is currently in progress. */
  isReindexing(): boolean {
    return this.reindexing
  }

  /** Returns the adaptive poll interval in milliseconds. */
  getPollInterval(): number {
    return this.pollIntervalMs
  }
}
