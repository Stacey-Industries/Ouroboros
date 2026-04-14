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

// ─── Launch diff result ───────────────────────────────────────────────────────

export interface LaunchDiffResult {
  changed: string[]
  deleted: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum files to check per poll cycle to avoid blocking the event loop. */
const MAX_FILES_PER_POLL = 100

/** Application-layer idle debounce on top of @parcel/watcher OS coalescing (ms). */
const APP_DEBOUNCE_MS = 300

/** Legacy 3s debounce for git commits and explicit triggers. */
const DEBOUNCE_MS = 3000

/** Threshold: if onFileChange receives more than this many paths, defer to polling. */
const IMMEDIATE_REINDEX_THRESHOLD = 5

// ─── AutoSyncWatcher ──────────────────────────────────────────────────────────

export class AutoSyncWatcher {
  private timer: ReturnType<typeof setTimeout> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private appDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private disposed = false
  private reindexing = false
  private pollIntervalMs: number

  /** Accumulates file paths received during the 300ms app-layer debounce window. */
  private pendingEvents: Map<string, number> = new Map()

  private opts: AutoSyncOptions

  constructor(opts: AutoSyncOptions) {
    this.opts = opts
    this.pollIntervalMs = AutoSyncWatcher.adaptivePollInterval(
      opts.db.getNodeCount(opts.projectName),
    )
  }

  /** Compute adaptive poll interval from node count. */
  private static adaptivePollInterval(nodeCount: number): number {
    if (nodeCount < 500) return 2_000      // 2s for small repos
    if (nodeCount < 2_000) return 5_000    // 5s for medium repos
    if (nodeCount < 5_000) return 15_000   // 15s for large repos
    return 30_000                           // 30s for very large repos
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
    if (this.appDebounceTimer) {
      clearTimeout(this.appDebounceTimer)
      this.appDebounceTimer = null
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

    const changed = await this.collectChangedFiles()
    if (changed.length > 0) {
      await this.triggerReindex()
    }
  }

  /** Collect files that have changed based on stat comparison. */
  private async collectChangedFiles(): Promise<string[]> {
    const changed: string[] = []
    let existingHashes: ReturnType<GraphDatabase['getAllFileHashes']>

    try {
      existingHashes = this.opts.db.getAllFileHashes(this.opts.projectName)
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      return changed
    }

    for (const record of existingHashes) {
      if (changed.length >= MAX_FILES_PER_POLL) break
      const absolutePath = path.join(this.opts.projectRoot, record.rel_path)
       
      await this.checkFileChanged(absolutePath, record, changed)
    }

    return changed
  }

  /** Check a single file's stat against the stored hash record. */
  private async checkFileChanged(
    absolutePath: string,
    record: ReturnType<GraphDatabase['getAllFileHashes']>[number],
    changed: string[],
  ): Promise<void> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- absolutePath from trusted graph record
      const stat = await fs.stat(absolutePath)
      const currentMtimeNs = Math.floor(stat.mtimeMs * 1e6)
      const currentSize = stat.size
      if (currentMtimeNs !== record.mtime_ns || currentSize !== record.size) {
        changed.push(record.rel_path)
      }
    } catch {
      // File deleted or inaccessible -- mark as changed so reindex handles removal
      changed.push(record.rel_path)
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

  // ─── Launch diff ──────────────────────────────────────────────────────────

  /**
   * Run init: perform a launch-time catalog diff to catch changes that
   * happened while the IDE was closed, then trigger a reindex of stale files.
   * Called by the registry during acquire(); not intended for direct use.
   */
  async initWithLaunchDiff(): Promise<void> {
    if (this.disposed) return
    try {
      const diff = await this.onLaunchDiff()
      const stale = [...diff.changed, ...diff.deleted]
      if (stale.length > 0) {
        await this.triggerReindex()
      }
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * Stat-only catalog diff (Continue.dev pattern).
   * Compares each stored file_hash record's mtime_ns+size against the live FS.
   * Returns paths whose mtime/size differ (changed) or are missing (deleted).
   * Does NOT read file contents — O(N) stat calls only.
   */
  async onLaunchDiff(): Promise<LaunchDiffResult> {
    const changed: string[] = []
    const deleted: string[] = []
    let hashes: ReturnType<typeof this.opts.db.getAllFileHashes>

    try {
      hashes = this.opts.db.getAllFileHashes(this.opts.projectName)
    } catch {
      return { changed, deleted }
    }

    for (const record of hashes) {
      const absPath = path.join(this.opts.projectRoot, record.rel_path)
      await this.classifyStoredFile(absPath, record, changed, deleted)
    }

    return { changed, deleted }
  }

  private async classifyStoredFile(
    absPath: string,
    record: ReturnType<typeof this.opts.db.getAllFileHashes>[number],
    changed: string[],
    deleted: string[],
  ): Promise<void> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath from trusted graph record
      const stat = await fs.stat(absPath)
      const mtimeNs = Math.floor(stat.mtimeMs * 1e6)
      if (mtimeNs !== record.mtime_ns || stat.size !== record.size) {
        changed.push(record.rel_path)
      }
    } catch {
      deleted.push(record.rel_path)
    }
  }

  // ─── Application-layer debounce (300ms) ───────────────────────────────────

  /**
   * Receives individual file-change events from @parcel/watcher (which already
   * does OS-level coalescing at 50–500ms). Accumulates paths in pendingEvents
   * and schedules a drain after 300ms of silence — handles editor atomic-save
   * sequences where multiple writes arrive in rapid succession.
   */
  receiveWatcherEvent(filePath: string): void {
    if (this.disposed) return

    const current = this.pendingEvents.get(filePath) ?? 0
    this.pendingEvents.set(filePath, current + 1)

    if (this.appDebounceTimer) clearTimeout(this.appDebounceTimer)
    this.appDebounceTimer = setTimeout(() => this.drainPendingEvents(), APP_DEBOUNCE_MS)
  }

  /** Flush all accumulated paths as a single batch and clear the map. */
  private drainPendingEvents(): void {
    this.appDebounceTimer = null
    if (this.disposed || this.pendingEvents.size === 0) return

    const paths = Array.from(this.pendingEvents.keys())
    this.pendingEvents.clear()
    this.onFileChange(paths)
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
    this.pollIntervalMs = AutoSyncWatcher.adaptivePollInterval(
      this.opts.db.getNodeCount(newProjectName),
    )

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
