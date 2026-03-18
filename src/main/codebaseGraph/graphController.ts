/**
 * graphController.ts — Main controller for the internal codebase graph engine.
 * Mirrors 14 tools from the codebase-memory MCP server, built natively for the IDE.
 */

import path from 'path';

import { indexAllFiles, reindexChangedPaths, TreeCache } from './graphIndexing';
import { initTreeSitter } from './graphParser';
import { GraphQueryEngine } from './graphQuery';
import { GraphStore } from './graphStore';
import type {
  ArchitectureView,
  CallPathResult,
  ChangeDetectionResult,
  CodeSnippetResult,
  GraphSchema,
  GraphToolContext,
  IndexStatus,
  SearchResult,
} from './graphTypes';

export class GraphController {
  private store: GraphStore;
  private query: GraphQueryEngine;
  private rootPath: string;
  private projectName: string;
  private indexedAt = 0;
  private indexDurationMs = 0;
  private initialized = false;
  private pendingChanges: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private treeCache = new TreeCache();
  private indexingInProgress = false;
  private pendingReindex: string[] | null = null;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.projectName = path.basename(rootPath);
    this.store = new GraphStore(rootPath);
    this.query = new GraphQueryEngine(this.store, rootPath);
  }

  async initialize(): Promise<void> {
    try {
      await initTreeSitter();
      console.log('[codebase-graph] tree-sitter WASM runtime initialized');
    } catch (err) {
      console.warn('[codebase-graph] tree-sitter init failed, falling back to regex:', err);
    }

    const loaded = await this.store.load();
    if (loaded && this.store.nodeCount() > 0) {
      this.initialized = true;
      this.indexedAt = Date.now();
      return;
    }

    await this.indexRepository({
      projectRoot: this.rootPath,
      projectName: this.projectName,
      incremental: false,
    });
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.treeCache.freeAll();
    try {
      await this.store.save();
    } catch {
      /* ignore save errors on shutdown */
    }
    this.initialized = false;
  }

  getStatus(): IndexStatus {
    return {
      initialized: this.initialized,
      projectRoot: this.rootPath,
      projectName: this.projectName,
      nodeCount: this.store.nodeCount(),
      edgeCount: this.store.edgeCount(),
      fileCount: this.store.fileCount(),
      lastIndexedAt: this.indexedAt,
      indexDurationMs: this.indexDurationMs,
    };
  }

  getGraphToolContext(): GraphToolContext {
    return {
      pipeline: { index: (options) => this.indexRepository(options) },
      projectRoot: this.rootPath,
      projectName: this.projectName,
    };
  }

  // ── Event hooks ───────────────────────────────────────────────────

  onSessionStart(): void {
    this.reindexChangedFiles().catch((err) => {
      console.warn('[codebase-graph] Session-start reindex failed:', err);
    });
  }

  onGitCommit(): void {
    this.reindexChangedFiles().catch((err) => {
      console.warn('[codebase-graph] Git-commit reindex failed:', err);
    });
  }

  onFileChange(paths: string[]): void {
    this.pendingChanges.push(...paths);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.reindexChangedFiles().catch((err) => {
        console.warn('[codebase-graph] Debounced reindex failed:', err);
      });
    }, 2000);
  }

  // ── Tool 1: indexRepository ───────────────────────────────────────

  async indexRepository(opts: {
    projectRoot: string;
    projectName: string;
    incremental: boolean;
  }): Promise<{ success: boolean }> {
    if (this.indexingInProgress) return { success: true };
    this.indexingInProgress = true;
    const startTime = Date.now();

    try {
      const ctx = { store: this.store, treeCache: this.treeCache, rootPath: this.rootPath };
      await indexAllFiles(ctx, opts.projectRoot, opts.incremental);
      this.indexedAt = Date.now();
      this.indexDurationMs = this.indexedAt - startTime;
      return { success: true };
    } catch (err) {
      console.error('[codebase-graph] Index failed:', err);
      return { success: false };
    } finally {
      this.drainPendingReindex();
    }
  }

  // ── Tools 2–14 (delegates) ───────────────────────────────────────

  indexStatus(): IndexStatus {
    return this.getStatus();
  }
  listProjects(): string[] {
    return this.initialized ? [this.rootPath] : [];
  }

  deleteProject(projectRoot: string): { success: boolean } {
    if (projectRoot !== this.rootPath) return { success: false };
    this.store.clear();
    this.initialized = false;
    return { success: true };
  }

  async detectChanges(): Promise<ChangeDetectionResult> {
    return this.query.detectChanges();
  }
  getArchitecture(aspects?: string[]): ArchitectureView {
    return this.query.getArchitecture(aspects);
  }
  async getCodeSnippet(symbolId: string): Promise<CodeSnippetResult | null> {
    return this.query.getCodeSnippet(symbolId);
  }
  getGraphSchema(): GraphSchema {
    return this.query.getGraphSchema();
  }

  ingestTraces(traces: unknown[]): { success: boolean; ingested: number } {
    let ingested = 0;
    if (!Array.isArray(traces)) return { success: false, ingested: 0 };
    for (const trace of traces) {
      if (typeof trace === 'object' && trace !== null && 'source' in trace && 'target' in trace) {
        const t = trace as { source: string; target: string; type?: string };
        this.store.addEdge({
          source: t.source,
          target: t.target,
          type: (t.type as 'calls') ?? 'calls',
        });
        ingested++;
      }
    }
    if (ingested > 0) {
      this.store
        .save()
        .catch((e) => console.error('[codebase-graph] Save after trace ingestion:', e));
    }
    return { success: true, ingested };
  }

  manageAdr(action: 'list' | 'get' | 'create' | 'update' | 'delete', id?: string): unknown {
    const adrDir = path.join(this.rootPath, 'docs', 'adr');
    const messages: Record<string, string> = {
      list: 'ADR directory: ' + adrDir,
      get: 'ADR not found',
      create: 'ADR creation requires file system write — use files:writeFile',
      update: 'ADR update requires file system write — use files:writeFile',
      delete: 'ADR deletion requires file system operation',
    };
    // eslint-disable-next-line security/detect-object-injection
    const msg = messages[action];
    return msg
      ? { success: true, ...(id ? { id } : {}), message: msg }
      : { success: false, error: 'Unknown ADR action' };
  }

  queryGraph(query: string): Array<Record<string, unknown>> {
    return this.query.queryGraph(query);
  }

  async searchCode(
    pattern: string,
    opts?: { fileGlob?: string; maxResults?: number },
  ): Promise<Array<{ filePath: string; line: number; match: string }>> {
    return this.query.searchCode(pattern, opts);
  }

  searchGraph(query: string, limit?: number): SearchResult[] {
    return this.query.searchGraph(query, limit);
  }
  traceCallPath(fromId: string, toId: string, maxDepth?: number): CallPathResult {
    return this.query.traceCallPath(fromId, toId, maxDepth);
  }

  // ── Internal ──────────────────────────────────────────────────────

  private async reindexChangedFiles(): Promise<void> {
    if (this.indexingInProgress) {
      const paths = [...new Set(this.pendingChanges)];
      this.pendingChanges = [];
      this.pendingReindex = [...(this.pendingReindex ?? []), ...paths];
      return;
    }
    this.indexingInProgress = true;
    try {
      const paths = [...new Set(this.pendingChanges)];
      this.pendingChanges = [];
      const ctx = { store: this.store, treeCache: this.treeCache, rootPath: this.rootPath };
      await reindexChangedPaths(ctx, this.query, paths);
      this.indexedAt = Date.now();
    } finally {
      this.drainPendingReindex();
    }
  }

  private drainPendingReindex(): void {
    this.indexingInProgress = false;
    if (this.pendingReindex) {
      const deferred = this.pendingReindex;
      this.pendingReindex = null;
      this.pendingChanges.push(...deferred);
      this.reindexChangedFiles().catch((err) => {
        console.warn('[codebase-graph] Deferred reindex failed:', err);
      });
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────

let instance: GraphController | null = null;

export function getGraphController(): GraphController | null {
  return instance;
}

export function setGraphController(controller: GraphController): void {
  instance = controller;
}
