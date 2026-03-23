/**
 * contextLayerController.ts — Builds the three context layers (repo map,
 * module summaries, dependency graph) from the repo indexer's data and
 * attaches them to context packets before they reach the provider.
 */

import { readFile } from 'fs/promises';
import path from 'path';

import { buildLspDiagnosticsSummary } from '../orchestration/lspDiagnosticsProvider';
import { buildRepoIndexSnapshot, type RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { ContextPacket } from '../orchestration/types';
import {
  aiEnrichModules,
  type AiSummarizerState,
  createAiSummarizerState,
  loadPersistedSummaries,
} from './contextLayerAiSummarizer';
import {
  applyGraphAnalysis,
  applyImportAnalysis,
  type CachedModuleData,
  DEFAULT_MODULE_DEPTH_LIMIT,
  type DetectedModule,
  detectModules,
  normalizePath,
  selectModuleSummariesForGoal,
} from './contextLayerControllerSupport';
import {
  countRefreshedModules,
  fireAndForgetRefreshEnrichment,
  maybeRunGraphAnalysis,
  type ModuleCacheState,
  refreshDirtyModuleCache,
  updateModuleCache,
} from './contextLayerRefresher';
import type { ContextLayerConfig } from './contextLayerTypes';
import { configureTypeScriptAliases } from './languageStrategies';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ContextLayerController {
  enrichPacket(
    packet: ContextPacket,
    goalKeywords: string[],
    existingSnapshot?: RepoIndexSnapshot,
  ): Promise<{ packet: ContextPacket }>;
  onConfigChange(config: ContextLayerConfig): Promise<void>;
  onSessionStart(): void;
  onGitCommit(): void;
  onFileChange(type: string, filePath: string): void;
}

interface InitContextLayerOptions {
  workspaceRoot: string;
  buildRepoIndex: (...args: unknown[]) => unknown;
  config: ContextLayerConfig;
}

// ---------------------------------------------------------------------------
// Controller implementation
// ---------------------------------------------------------------------------

let controller: ContextLayerController | null = null;

class ContextLayerControllerImpl implements ContextLayerController {
  private config: ContextLayerConfig;
  private workspaceRoots: string[];
  private readonly moduleCache: ModuleCacheState = {
    cachedModules: new Map<string, CachedModuleData>(),
    cachedRepoMap: null,
    lastSnapshotCacheKey: null,
    dirtyModuleIds: new Set<string>(),
  };
  initPromise: Promise<void> | null = null;

  private fileChangeBuffer: string[] = [];
  private fileChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly FILE_CHANGE_DEBOUNCE_MS = 2_000;

  private lastInitCompletedAt = 0;
  private static readonly INIT_COOLDOWN_MS = 5 * 60 * 1000;

  private static readonly MAX_AI_FAILURES = 3;
  private readonly aiState: AiSummarizerState;

  constructor(config: ContextLayerConfig, workspaceRoot: string) {
    this.config = config;
    this.workspaceRoots = workspaceRoot ? [workspaceRoot] : [];
    this.aiState = createAiSummarizerState(ContextLayerControllerImpl.MAX_AI_FAILURES);
  }

  private async loadPathAliases(): Promise<void> {
    if (this.workspaceRoots.length === 0) return;
    const root = this.workspaceRoots[0];
    const candidates = ['tsconfig.node.json', 'tsconfig.web.json', 'tsconfig.json'];
    const mergedPaths: Record<string, string[]> = {};

    for (const name of candidates) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from known config file names within workspace root
        const raw = await readFile(path.join(root, name), 'utf-8');
        const parsed = JSON.parse(raw);
        const paths = parsed?.compilerOptions?.paths;
        if (paths && typeof paths === 'object') {
          Object.assign(mergedPaths, paths);
        }
      } catch {
        // File doesn't exist or isn't valid JSON — skip
      }
    }

    if (Object.keys(mergedPaths).length > 0) {
      configureTypeScriptAliases(mergedPaths);
    }
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled || this.workspaceRoots.length === 0) {
      console.log('[context-layer] Skipping init — disabled or no workspace root');
      return;
    }

    const startMs = Date.now();
    await this.loadPathAliases();

    const snapshot = await buildRepoIndexSnapshot(this.workspaceRoots, {
      diagnosticsProvider: buildLspDiagnosticsSummary,
    });

    const changedFiles = new Set<string>();
    const depthLimit = this.config.moduleDepthLimit ?? DEFAULT_MODULE_DEPTH_LIMIT;
    const modules = detectModules(snapshot.roots, changedFiles, depthLimit);
    applyImportAnalysis(modules, snapshot.roots);

    const allFiles = snapshot.roots.flatMap((r) => r.files);
    applyGraphAnalysis(modules, snapshot.roots, allFiles);

    this.updateCacheFromModules(modules, snapshot);
    this.logInitResults(modules, startMs);

    await loadPersistedSummaries(this.moduleCache.cachedModules, this.workspaceRoots);
    this.fireAndForgetEnrichment(modules);
  }

  private updateCacheFromModules(modules: DetectedModule[], snapshot: RepoIndexSnapshot): void {
    updateModuleCache(this.moduleCache, modules, snapshot);
    this.lastInitCompletedAt = Date.now();
  }

  private logInitResults(modules: DetectedModule[], startMs: number): void {
    const elapsedMs = Date.now() - startMs;
    const updated = modules.filter((m) => {
      const cached = this.moduleCache.cachedModules.get(m.id);
      return cached && !cached.aiEnriched;
    }).length;
    const skipped = modules.length - updated;

    console.log(
      `[context-layer] Indexed ${modules.length} modules in ${elapsedMs}ms` +
        ` (${updated} updated, ${skipped} unchanged)`,
    );
    if (updated > 0 && modules.length < 80) {
      this.logModuleDetails(modules);
    }
  }

  private logModuleDetails(modules: DetectedModule[]): void {
    const sorted = modules.slice().sort((a, b) => b.files.length - a.files.length);
    for (const m of sorted) {
      const s = m.boundarySignals;
      const importInfo =
        s.barrelImportCount + s.directImportCount > 0
          ? `, imports: ${s.barrelImportCount}barrel/${s.directImportCount}direct`
          : '';
      console.log(
        `[context-layer]   ${m.id} (${m.files.length} files, ${s.boundaryStrength}${s.hasBarrel ? ', barrel' : ''}, cohesion: ${(m.cohesion * 100).toFixed(0)}%${importInfo})`,
      );
    }
  }

  private fireAndForgetEnrichment(modules: DetectedModule[]): void {
    if (!this.config.autoSummarize) return;
    const toEnrich = modules
      .filter((m) => {
        const cached = this.moduleCache.cachedModules.get(m.id);
        return cached && !cached.aiEnriched;
      })
      .map((m) => m.id);

    if (toEnrich.length > 0) {
      console.log(`[context-layer] Queuing AI enrichment for ${toEnrich.length} module(s)`);
      aiEnrichModules({
        moduleIds: toEnrich,
        cachedModules: this.moduleCache.cachedModules,
        aiState: this.aiState,
        workspaceRoots: this.workspaceRoots,
      }).catch((err) => {
        console.warn('[context-layer] AI enrichment failed:', err);
      });
    }
  }

  async enrichPacket(
    packet: ContextPacket,
    goalKeywords: string[],
    existingSnapshot?: RepoIndexSnapshot,
  ): Promise<{ packet: ContextPacket }> {
    if (this.initPromise) await this.initPromise;

    if (this.moduleCache.cachedModules.size === 0) {
      if (this.workspaceRoots.length === 0) {
        this.workspaceRoots = packet.repoFacts.workspaceRoots;
      }
      await this.initialize();
    }

    if (this.moduleCache.dirtyModuleIds.size > 0) {
      await this.refreshDirtyModules(packet, existingSnapshot);
    }

    const maxModules = Math.min(this.config.maxModules, 12);
    const moduleSummaries = selectModuleSummariesForGoal(
      this.moduleCache.cachedModules,
      goalKeywords,
      maxModules,
    );

    return {
      packet: {
        ...packet,
        repoMap: this.moduleCache.cachedRepoMap ?? undefined,
        moduleSummaries,
      },
    };
  }

  async onConfigChange(config: ContextLayerConfig): Promise<void> {
    const wasEnabled = this.config.enabled;
    const wasAutoSummarize = this.config.autoSummarize;
    this.config = config;

    if (config.enabled && !wasEnabled) {
      console.log('[context-layer] Enabled — running initial index');
      await this.initialize();
    } else if (!config.enabled) {
      this.clearCache();
    } else if (config.autoSummarize && !wasAutoSummarize) {
      this.enrichUnenrichedModules();
    }
  }

  private clearCache(): void {
    console.log('[context-layer] Disabled — clearing cache');
    this.moduleCache.cachedModules.clear();
    this.moduleCache.cachedRepoMap = null;
    this.moduleCache.lastSnapshotCacheKey = null;
  }

  private enrichUnenrichedModules(): void {
    const unenriched = Array.from(this.moduleCache.cachedModules.entries())
      .filter(([, v]) => !v.aiEnriched)
      .map(([id]) => id);
    if (unenriched.length > 0) {
      console.log(
        `[context-layer] AutoSummarize enabled — enriching ${unenriched.length} cached modules`,
      );
      aiEnrichModules({
        moduleIds: unenriched,
        cachedModules: this.moduleCache.cachedModules,
        aiState: this.aiState,
        workspaceRoots: this.workspaceRoots,
      }).catch((err) => {
        console.warn('[context-layer] AI enrichment on autoSummarize enable failed:', err);
      });
    }
  }

  onSessionStart(): void {
    const msSinceLastInit = Date.now() - this.lastInitCompletedAt;
    if (
      this.lastInitCompletedAt > 0 &&
      msSinceLastInit < ContextLayerControllerImpl.INIT_COOLDOWN_MS
    ) {
      console.log(
        `[context-layer] Skipping session-start re-index — last init was ${(msSinceLastInit / 1000).toFixed(1)}s ago`,
      );
      return;
    }

    this.initPromise = this.initialize().catch((err) => {
      console.warn('[context-layer] Re-index on session start failed:', err);
    });
  }

  onGitCommit(): void {
    for (const id of this.moduleCache.cachedModules.keys()) {
      this.moduleCache.dirtyModuleIds.add(id);
    }

    import('../orchestration/contextPacketBuilder')
      .then(({ clearContextPacketCache }) => {
        clearContextPacketCache();
      })
      .catch((error) => {
        console.error('[context-layer] Failed to clear context packet cache on git commit:', error);
      });

    console.log('[context-layer] Git commit detected — all modules marked dirty');
  }

  onFileChange(_type: string, filePath: string): void {
    this.fileChangeBuffer.push(filePath);
    if (this.fileChangeTimer !== null) clearTimeout(this.fileChangeTimer);

    this.fileChangeTimer = setTimeout(() => {
      this.fileChangeTimer = null;
      this.processBufferedFileChanges();
    }, ContextLayerControllerImpl.FILE_CHANGE_DEBOUNCE_MS);
  }

  private processBufferedFileChanges(): void {
    const paths = this.fileChangeBuffer.splice(0);
    if (paths.length === 0) return;

    this.invalidateCachesForChangedFiles(paths);
    this.markDirtyModulesFromPaths(paths);

    if (this.moduleCache.dirtyModuleIds.size > 0) {
      console.log(
        `[context-layer] ${paths.length} file change(s) debounced — ${this.moduleCache.dirtyModuleIds.size} module(s) marked dirty`,
      );
    }
  }

  private invalidateCachesForChangedFiles(paths: string[]): void {
    import('../orchestration/contextPacketBuilder')
      .then(({ clearContextPacketCache }) => {
        clearContextPacketCache();
      })
      .catch((error) => {
        console.error(
          '[context-layer] Failed to clear context packet cache on file change:',
          error,
        );
      });
    import('../orchestration/contextSelectionSupport')
      .then(({ invalidateSnapshotCache }) => {
        invalidateSnapshotCache(paths);
      })
      .catch((error) => {
        console.error('[context-layer] Failed to invalidate snapshot cache on file change:', error);
      });
  }

  private markDirtyModulesFromPaths(paths: string[]): void {
    const normalizedPaths = new Set(paths.map(normalizePath));
    for (const [id, cached] of this.moduleCache.cachedModules) {
      const hasChanged = cached.module.files.some((f) =>
        normalizedPaths.has(normalizePath(f.path)),
      );
      if (hasChanged) this.moduleCache.dirtyModuleIds.add(id);
    }
  }

  private async refreshDirtyModules(
    packet: ContextPacket,
    existingSnapshot?: RepoIndexSnapshot,
  ): Promise<void> {
    if (this.moduleCache.dirtyModuleIds.size === 0) return;
    const startMs = Date.now();

    const snapshot =
      existingSnapshot ??
      (await buildRepoIndexSnapshot(packet.repoFacts.workspaceRoots, {
        diagnosticsProvider: buildLspDiagnosticsSummary,
      }));

    if (snapshot.cache.key === this.moduleCache.lastSnapshotCacheKey) {
      this.moduleCache.dirtyModuleIds.clear();
      return;
    }

    const changedFiles = new Set<string>();
    for (const file of packet.repoFacts.gitDiff.changedFiles) {
      changedFiles.add(normalizePath(file.filePath));
    }

    const depthLimit = this.config.moduleDepthLimit ?? DEFAULT_MODULE_DEPTH_LIMIT;
    const modules = detectModules(snapshot.roots, changedFiles, depthLimit);
    applyImportAnalysis(modules, snapshot.roots);
    maybeRunGraphAnalysis(
      modules,
      snapshot.roots,
      this.moduleCache.dirtyModuleIds.size,
      snapshot.roots.flatMap((r) => r.files),
    );
    refreshDirtyModuleCache(this.moduleCache, modules, snapshot);

    const elapsedMs = Date.now() - startMs;
    const refreshed = countRefreshedModules(modules, this.moduleCache.cachedModules);
    console.log(`[context-layer] Refreshed ${refreshed} dirty modules in ${elapsedMs}ms`);

    fireAndForgetRefreshEnrichment({
      modules,
      autoSummarize: this.config.autoSummarize,
      cachedModules: this.moduleCache.cachedModules,
      aiState: this.aiState,
      workspaceRoots: this.workspaceRoots,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initContextLayer(options: InitContextLayerOptions): Promise<void> {
  const impl = new ContextLayerControllerImpl(options.config, options.workspaceRoot);
  controller = impl;
  impl.initPromise = impl.initialize();
  await impl.initPromise;
}

export function getContextLayerController(): ContextLayerController | null {
  return controller;
}
