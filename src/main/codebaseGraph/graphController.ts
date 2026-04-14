/** graphController.ts — Main controller for the internal codebase graph engine. */

import path from 'path';
import { Worker } from 'worker_threads';

import log from '../logger';
import { buildWorkerPipeAuthSeed } from '../pipeAuth';
import {
  applyFullIndexToStore,
  applyReindexToStore,
  ingestTracesIntoStore,
  logIndexProgress,
  makeIndexTimeout,
  manageAdrAction,
  resolveWorkerPath,
  unregisterGraphController,
} from './graphControllerSupport';
export {
  acquireGraphController,
  getGraphController,
  getGraphControllerForRoot,
  releaseGraphController,
  setGraphController,
} from './graphControllerSupport';
import { GraphQueryEngine } from './graphQuery';
import { GraphStore } from './graphStore';
import type {
  ArchitectureView,
  CallPathResult,
  ChangeDetectionResult,
  CodeSnippetResult,
  GraphEdge,
  GraphNode,
  GraphSchema,
  GraphToolContext,
  IndexStatus,
  SearchResult,
} from './graphTypes';
import type { WorkerResponse } from './graphWorkerTypes';

export class GraphController {
  private store: GraphStore;
  private query: GraphQueryEngine;
  readonly rootPath: string;
  private projectName: string;
  private indexedAt = 0;
  private indexDurationMs = 0;
  private initialized = false;
  private pendingChanges: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private indexingInProgress = false;
  private pendingReindex: string[] | null = null;
  private worker: Worker | null = null;
  private initResolve: (() => void) | null = null;
  private initReject: ((err: Error) => void) | null = null;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.projectName = path.basename(rootPath);
    this.store = new GraphStore(rootPath);
    this.query = new GraphQueryEngine(this.store, rootPath);
  }

  async initialize(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded && this.store.nodeCount() > 0) {
      this.initialized = true;
      this.indexedAt = Date.now();
      this.spawnWorker();
      return;
    }

    this.spawnWorker();
    await this.requestFullIndex(false);
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.terminateWorker();
    try {
      await this.store.save();
    } catch {
      /* ignore save errors on shutdown */
    }
    this.store.close();
    this.initialized = false;
    unregisterGraphController(this.rootPath, this);
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

  onSessionStart(): void {
    this.reindexChangedFiles().catch((err) => {
      log.warn('Session-start reindex failed:', err);
    });
  }

  onGitCommit(): void {
    this.reindexChangedFiles().catch((err) => {
      log.warn('Git-commit reindex failed:', err);
    });
  }

  onFileChange(paths: string[]): void {
    this.pendingChanges.push(...paths);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.reindexChangedFiles().catch((err) => {
        log.warn('Debounced reindex failed:', err);
      });
    }, 2000);
  }

  async indexRepository(opts: {
    projectRoot: string;
    projectName: string;
    incremental: boolean;
  }): Promise<{ success: boolean }> {
    if (this.indexingInProgress) return { success: true };
    try {
      await this.requestFullIndex(opts.incremental);
      return { success: true };
    } catch (err) {
      log.error('Index failed:', err);
      return { success: false };
    }
  }

  indexStatus = this.getStatus.bind(this);
  listProjects(): string[] {
    return this.initialized ? [this.rootPath] : [];
  }

  deleteProject(projectRoot: string): { success: boolean } {
    if (projectRoot !== this.rootPath) return { success: false };
    this.store.clear();
    this.initialized = false;
    return { success: true };
  }

  async detectChanges(): Promise<ChangeDetectionResult> { return this.query.detectChanges(); }
  async detectChangesForSession(sid: string, files: string[]): Promise<ChangeDetectionResult> {
    return this.query.detectChangesForSession(sid, files);
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
    return ingestTracesIntoStore(this.store, traces);
  }
  manageAdr(action: 'list' | 'get' | 'create' | 'update' | 'delete', id?: string): unknown {
    return manageAdrAction(this.rootPath, action, id);
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

  private spawnWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(resolveWorkerPath(__dirname), { workerData: buildWorkerPipeAuthSeed() });

    this.worker.on('message', (msg: WorkerResponse) => {
      this.handleWorkerMessage(msg);
    });

    this.worker.on('error', (err) => {
      log.error('Worker error:', err);
      this.rejectPendingInit(err);
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        log.warn(`Worker exited with code ${code}`);
      }
      this.worker = null;
    });
  }

  private async terminateWorker(): Promise<void> {
    if (!this.worker) return;
    try {
      await this.worker.terminate();
    } catch {
      /* already exited */
    }
    this.worker = null;
  }

  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        log.info('Worker thread ready');
        break;
      case 'indexComplete':
        this.applyFullIndex(msg.nodes, msg.edges, msg.durationMs);
        break;
      case 'reindexComplete':
        this.applyReindex(msg.nodes, msg.edges, msg.removedRelPaths);
        break;
      case 'progress':
        logIndexProgress(msg.filesProcessed, msg.totalFiles);
        break;
      case 'error':
        log.error(`Worker error (${msg.requestType}):`, msg.message);
        this.rejectPendingInit(new Error(msg.message));
        this.drainPendingReindex();
        break;
    }
  }

  private applyFullIndex(nodes: GraphNode[], edges: GraphEdge[], durationMs: number): void {
    applyFullIndexToStore(this.store, nodes, edges);
    this.indexedAt = Date.now();
    this.indexDurationMs = durationMs;
    log.info(`Index complete: ${nodes.length} nodes, ${edges.length} edges (${durationMs}ms)`);
    this.resolvePendingInit();
    this.drainPendingReindex();
  }

  private applyReindex(nodes: GraphNode[], edges: GraphEdge[], removedRelPaths: string[]): void {
    applyReindexToStore(this.store, nodes, edges, removedRelPaths);
    this.indexedAt = Date.now();
    this.drainPendingReindex();
  }

  private requestFullIndex(incremental: boolean): Promise<void> {
    if (this.indexingInProgress) return Promise.resolve();
    this.indexingInProgress = true;

    const indexPromise = new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;
      this.worker?.postMessage({
        type: 'indexAll',
        projectRoot: this.rootPath,
        projectName: this.projectName,
        incremental,
      });
    });

    return Promise.race([indexPromise, makeIndexTimeout()]);
  }

  private resolvePendingInit(): void {
    this.indexingInProgress = false;
    if (this.initResolve) {
      this.initResolve();
      this.initResolve = null;
      this.initReject = null;
    }
  }

  private rejectPendingInit(err: Error): void {
    this.indexingInProgress = false;
    if (this.initReject) {
      this.initReject(err);
      this.initResolve = null;
      this.initReject = null;
    }
  }

  private async reindexChangedFiles(): Promise<void> {
    if (this.indexingInProgress) {
      this.pendingReindex = [...(this.pendingReindex ?? []), ...new Set(this.pendingChanges)];
      this.pendingChanges = [];
      return;
    }
    this.indexingInProgress = true;
    let paths = [...new Set(this.pendingChanges)];
    this.pendingChanges = [];
    if (paths.length === 0) {
      const changes = await this.query.detectChanges();
      if (changes.changedFiles.length === 0) {
        this.indexingInProgress = false;
        return;
      }
      paths = changes.changedFiles.map((r) => path.join(this.rootPath, r));
    }
    this.worker?.postMessage({
      type: 'reindexFiles',
      projectRoot: this.rootPath,
      projectName: this.projectName,
      paths,
    });
  }

  private drainPendingReindex(): void {
    this.indexingInProgress = false;
    if (!this.pendingReindex) return;
    this.pendingChanges.push(...this.pendingReindex);
    this.pendingReindex = null;
    this.reindexChangedFiles().catch((e) => log.warn('Deferred reindex failed:', e));
  }
}
