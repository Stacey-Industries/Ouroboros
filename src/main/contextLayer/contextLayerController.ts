/**
 * contextLayerController.ts — Thin orchestration layer over the context layer
 * subsystem. Delegates all real work to injected collaborators:
 *   - buildRepoIndex     → repo index snapshot
 *   - generateRepoMap    → module detection + structural summaries
 *   - contextLayerStore  → persistence (repo map, module entries, manifest)
 *   - contextLayerWatcher → file/git/session event routing
 *   - contextInjector    → packet enrichment
 *   - contextLayerGC     → storage garbage collection
 *   - summarizationQueue → background AI summarization
 */

import log from '../logger'
import type { RepoIndexSnapshot } from '../orchestration/repoIndexer'
import type { ContextPacket, RepoFacts } from '../orchestration/types'
import { broadcast } from '../web/broadcast'
import { injectContextLayer } from './contextInjector'
import {
  createQueueForRepoMap,
  type CreateQueueOptions,
  runGC,
  setupGcTimer,
  setupWatcher,
} from './contextLayerControllerHelpers'
import {
  type ContextLayerController,
  type ContextLayerControllerStatus,
  getGitChangedFiles,
  type InitContextLayerOptions,
  type SymbolIndex,
} from './contextLayerControllerTypes'
import {
  ensureGitignore,
  initContextLayerStore,
  readManifest,
  readRepoMap,
  writeManifest,
  writeRepoMap,
} from './contextLayerStore'
import type { ContextLayerConfig, ContextLayerManifest, RepoMap } from './contextLayerTypes'
import type { ContextLayerWatcher } from './contextLayerWatcher'
import { generateRepoMap } from './repoMapGenerator'
import type { SummarizationQueue } from './summarizationQueue'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Manifests older than this trigger a full rebuild. */
const MANIFEST_STALE_THRESHOLD_MS = 60_000

// Re-export types for consumers who import from this module
export type { ContextLayerController, ContextLayerControllerStatus, InitContextLayerOptions, SymbolIndex, SymbolIndexEntry } from './contextLayerControllerTypes'
export { getGitChangedFiles } from './contextLayerControllerTypes'

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let controller: ContextLayerController | null = null

// ---------------------------------------------------------------------------
// Controller implementation
// ---------------------------------------------------------------------------

class ContextLayerControllerImpl implements ContextLayerController {
  private config: ContextLayerConfig
  private workspaceRoot: string
  private buildRepoIndex: (roots: string[]) => Promise<RepoIndexSnapshot>

  private snapshot: RepoIndexSnapshot | null = null
  private repoMap: RepoMap | null = null
  private repoMapGeneratedAt: number | null = null
  private health: 'healthy' | 'degraded' | 'disabled' = 'disabled'

  private watcher: ContextLayerWatcher | null = null
  private queue: SummarizationQueue | null = null
  private gcTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false

  constructor(options: InitContextLayerOptions) {
    this.config = options.config
    this.workspaceRoot = options.workspaceRoot
    this.buildRepoIndex = options.buildRepoIndex
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.health = 'disabled'
      return
    }

    await initContextLayerStore(this.workspaceRoot)
    await ensureGitignore(this.workspaceRoot)

    const loaded = await this.tryLoadFromDisk()
    if (!loaded) {
      await this.runFullRebuild()
    }

    this.setupWatcher()
    this.setupGcTimer()
    this.health = 'healthy'
  }

  private async tryLoadFromDisk(): Promise<boolean> {
    const manifest = await readManifest(this.workspaceRoot)
    if (!manifest) return false

    const age = Date.now() - manifest.lastFullRebuild
    if (age > MANIFEST_STALE_THRESHOLD_MS) return false

    const repoMap = await readRepoMap(this.workspaceRoot)
    if (!repoMap) return false

    this.repoMap = repoMap
    this.repoMapGeneratedAt = Date.now()
    log.info('[context-layer] Loaded from disk (manifest fresh)')
    return true
  }

  private async runFullRebuild(): Promise<void> {
    const snapshot = await this.buildRepoIndex([this.workspaceRoot])
    this.snapshot = snapshot
    const repoFacts = snapshot.repoFacts

    const newRepoMap = generateRepoMap({
      repoFacts,
      repoIndex: snapshot,
      workspaceRoot: this.workspaceRoot,
    })

    await writeRepoMap(this.workspaceRoot, newRepoMap)

    const manifest: ContextLayerManifest = {
      version: 1,
      lastFullRebuild: Date.now(),
      lastIncrementalUpdate: Date.now(),
      repoMapHash: newRepoMap.projectName,
      moduleHashes: {},
      totalSizeBytes: 0,
    }
    await writeManifest(this.workspaceRoot, manifest)

    this.repoMap = newRepoMap
    this.repoMapGeneratedAt = Date.now()

    await this.doRunGC(newRepoMap)
    this.enqueueForSummarization(newRepoMap)
  }

  private setupWatcher(): void {
    this.watcher = setupWatcher(this.workspaceRoot, this.config, () => this.forceRebuild())
  }

  private setupGcTimer(): void {
    this.gcTimer = setupGcTimer(() => this.repoMap, (rm) => runGC(this.workspaceRoot, rm, this.config))
  }

  private async doRunGC(repoMap: RepoMap): Promise<void> {
    await runGC(this.workspaceRoot, repoMap, this.config)
  }

  private enqueueForSummarization(repoMap: RepoMap): void {
    if (!this.config.autoSummarize) return
    if (!this.queue) {
      const queueOptions: CreateQueueOptions = {
        snapshot: this.snapshot ?? undefined,
        onProgress: (progress) => { broadcast('contextLayer:progress', progress) },
      }
      this.queue = createQueueForRepoMap(this.workspaceRoot, repoMap, queueOptions)
    }
    this.queue.enqueue(repoMap.modules.map((e) => e.structural.module.id))
  }

  async enrichPacket(
    packet: ContextPacket,
    goalKeywords: string[],
  ): Promise<{ packet: ContextPacket; injectedModules: string[]; injectedTokens: number }> {
    if (!this.config.enabled) {
      return { packet, injectedModules: [], injectedTokens: 0 }
    }

    try {
      const result = await injectContextLayer({
        packet,
        workspaceRoot: this.workspaceRoot,
        goalKeywords,
      })
      return result
    } catch (err) {
      log.warn('[context-layer] enrichPacket failed:', err)
      this.health = 'degraded'
      return { packet, injectedModules: [], injectedTokens: 0 }
    }
  }

  onFileChange(type: string, filePath: string): void {
    this.watcher?.onFileChange(type, filePath)
  }

  onGitCommit(): void {
    if (!this.watcher) return
    // Get changed files from git to do targeted invalidation instead of full-dirty
    getGitChangedFiles(this.workspaceRoot)
      .then((changedPaths) => {
        this.watcher?.onGitCommit(changedPaths.length > 0 ? changedPaths : undefined)
      })
      .catch(() => {
        // Git not available or not a repo — fall back to full invalidation
        this.watcher?.onGitCommit()
      })
  }

  onSessionStart(): void {
    this.watcher?.onSessionStart()
  }

  onCwdChanged(newCwd: string): void {
    log.info(`[context-layer] cwd_changed → ${newCwd}`)
    // Future: re-scope the context layer to the new working directory.
    // For now, just log — callers that need re-scoping can call forceRebuild.
  }

  onFileChanged(): void {
    // Lighter than onGitCommit — mark the layer as needing refresh without
    // assuming a commit occurred. Delegates to the watcher's file-change path.
    this.watcher?.onFileChange('change', '')
  }

  async onConfigChange(config: ContextLayerConfig): Promise<void> {
    this.config = config
    if (!config.enabled) {
      this.health = 'disabled'
      return
    }
    await this.runFullRebuild()
  }

  async forceRebuild(): Promise<void> {
    await this.runFullRebuild()
  }

  getStatus(): ContextLayerControllerStatus {
    const summaryCount = this.repoMap
      ? this.repoMap.modules.filter((e) => e.ai != null).length
      : 0

    const effectiveHealth = this.disposed ? 'disabled' : this.health

    return {
      enabled: this.config.enabled,
      health: effectiveHealth,
      workspaceRoot: this.workspaceRoot,
      moduleCount: this.repoMap?.moduleCount ?? 0,
      summaryCount,
      repoMapAge: this.repoMapGeneratedAt != null
        ? Date.now() - this.repoMapGeneratedAt
        : null,
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.health = 'disabled'

    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }

    this.watcher?.dispose()
    this.watcher = null

    this.queue?.dispose()
    this.queue = null
    this.snapshot = null

    controller = null
  }

  async switchWorkspace(newRoot: string): Promise<void> {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
    this.watcher?.dispose()
    this.watcher = null
    this.queue?.dispose()
    this.queue = null

    this.workspaceRoot = newRoot
    this.repoMap = null
    this.repoMapGeneratedAt = null
    this.snapshot = null
    this.health = 'disabled'
    this.disposed = false

    await this.initialize()
  }

  getRepoMap(): RepoMap | null {
    return this.repoMap
  }

  getLastRepoFacts(): RepoFacts | null {
    return null
  }

  getSymbolIndex(): SymbolIndex {
    return { size: 0, searchByName: () => [] }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initContextLayer(options: InitContextLayerOptions): Promise<void> {
  // Dispose any existing controller first
  if (controller) {
    await controller.dispose()
  }

  const impl = new ContextLayerControllerImpl(options)
  controller = impl
  await impl.initialize()
}

export function getContextLayerController(): ContextLayerController | null {
  return controller
}
