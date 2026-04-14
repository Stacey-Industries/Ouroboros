/**
 * graphControllerSupport.ts — Singleton management and helpers
 * extracted from graphController.ts to satisfy max-lines.
 */

import path from 'path';

import log from '../logger';
import type { GraphController } from './graphController';
import type { IGraphStore } from './graphStoreTypes';
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

// ---------------------------------------------------------------------------
// GraphControllerLike — shared interface for System 1 and System 2 compat.
//
// Both GraphController and GraphControllerCompat conform to this interface
// structurally. The registry stores GraphControllerLike so the factory can
// register a GraphControllerCompat instance without a type cast.
// ---------------------------------------------------------------------------

export interface GraphControllerLike {
  readonly rootPath: string;
  getStatus(): IndexStatus;
  indexStatus: () => IndexStatus;
  getGraphToolContext(): GraphToolContext;
  onSessionStart(): void;
  onGitCommit(): void;
  onFileChange(paths: string[]): void;
  indexRepository(opts: {
    projectRoot: string;
    projectName: string;
    incremental: boolean;
  }): Promise<{ success: boolean }>;
  listProjects(): string[];
  deleteProject(projectRoot: string): { success: boolean };
  detectChanges(): Promise<ChangeDetectionResult>;
  detectChangesForSession(sessionId: string, files: string[]): Promise<ChangeDetectionResult>;
  getArchitecture(aspects?: string[]): ArchitectureView;
  getCodeSnippet(symbolId: string): Promise<CodeSnippetResult | null>;
  getGraphSchema(): GraphSchema;
  ingestTraces(traces: unknown[]): { success: boolean; ingested: number };
  manageAdr(action: 'list' | 'get' | 'create' | 'update' | 'delete', id?: string): unknown;
  queryGraph(query: string): Array<Record<string, unknown>>;
  searchCode(
    pattern: string,
    opts?: { fileGlob?: string; maxResults?: number },
  ): Promise<Array<{ filePath: string; line: number; match: string }>>;
  searchGraph(query: string, limit?: number): SearchResult[];
  traceCallPath(fromId: string, toId: string, maxDepth?: number): CallPathResult;
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Worker path helpers
// ---------------------------------------------------------------------------

export function resolveWorkerPath(dirname: string): string {
  const outMainDir = dirname.endsWith('chunks') ? path.dirname(dirname) : dirname;
  return path.join(outMainDir, 'graphWorker.js');
}

export function makeIndexTimeout(): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Graph indexing timed out after 60s')), 60_000),
  );
}

// ---------------------------------------------------------------------------
// Index application helpers
// ---------------------------------------------------------------------------

export function applyFullIndexToStore(
  store: IGraphStore,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  store.clear();
  store.addBulk(nodes, edges);
  store.save().catch((e: unknown) => log.error('Save failed:', e));
}

export function applyReindexToStore(
  store: IGraphStore,
  nodes: GraphNode[],
  edges: GraphEdge[],
  removedRelPaths: string[],
): void {
  store.transaction(() => {
    for (const relPath of removedRelPaths) store.clearFile(relPath);
    for (const node of nodes) store.addNode(node);
    store.replaceAllEdges(edges);
  });
  store.save().catch((e: unknown) => log.error('Save failed:', e));
}

export function logIndexProgress(processed: number, total: number): void {
  if (processed % 50 === 0 || processed === total) {
    log.info(`Indexed ${processed}/${total} files`);
  }
}

export function isTraceObject(trace: unknown): boolean {
  return typeof trace === 'object' && trace !== null && 'source' in trace && 'target' in trace;
}

export function ingestTracesIntoStore(
  store: IGraphStore,
  traces: unknown[],
): { success: boolean; ingested: number } {
  let ingested = 0;
  if (!Array.isArray(traces)) return { success: false, ingested: 0 };
  store.transaction(() => {
    for (const trace of traces) {
      if (isTraceObject(trace)) {
        const t = trace as { source: string; target: string; type?: string };
        store.addEdge({
          source: t.source,
          target: t.target,
          type: (t.type as GraphEdge['type']) ?? 'calls',
        });
        ingested++;
      }
    }
  });
  if (ingested > 0) {
    store.save().catch((e: unknown) => log.error('Save after trace:', e));
  }
  return { success: true, ingested };
}

export function manageAdrAction(
  rootPath: string,
  action: 'list' | 'get' | 'create' | 'update' | 'delete',
  id?: string,
): unknown {
  const adrDir = path.join(rootPath, 'docs', 'adr');
  const messages = new Map<string, string>([
    ['list', 'ADR directory: ' + adrDir],
    ['get', 'ADR not found'],
    ['create', 'ADR creation requires file system write — use files:writeFile'],
    ['update', 'ADR update requires file system write — use files:writeFile'],
    ['delete', 'ADR deletion requires file system operation'],
  ]);
  const msg = messages.get(action);
  return msg
    ? { success: true, ...(id ? { id } : {}), message: msg }
    : { success: false, error: 'Unknown ADR action' };
}

// ── Per-root registry (Zed model: keyed by normalized root, ref-counted) ──
//
// The registry stores GraphControllerLike so both System 1 (GraphController)
// and System 2 (GraphControllerCompat) instances can be registered without
// casting. Consumers receive GraphControllerLike from getGraphController().

interface RegistryEntry {
  controller: GraphControllerLike;
  refCount: number;
}

const registry = new Map<string, RegistryEntry>();
let defaultRoot: string | null = null;

// Shared System 2 GraphDatabase instance — set by setSystem2Db() when the
// System 2 path is enabled. Allows per-window acquireGraphController to
// reuse the same DB connection rather than opening a new one per root.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoid direct import of GraphDatabase here to prevent eager load
let _system2Db: any | null = null;

/** Called once at startup (by initCodebaseGraphSystem2) with the shared DB. */
export function setSystem2Db(db: unknown): void {
  _system2Db = db;
}

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Legacy setter — registers as the default root instance. */
export function setGraphController(controller: GraphControllerLike): void {
  const key = normalizeRoot(controller.rootPath);
  defaultRoot = key;
  registry.set(key, { controller, refCount: 1 });
}

/**
 * Backward-compat getter — returns the default root's controller.
 * Returns GraphControllerLike (satisfied by both System 1 and System 2).
 * Callers without root context use this.
 */
export function getGraphController(): GraphControllerLike | null {
  if (defaultRoot) return registry.get(defaultRoot)?.controller ?? null;
  const first = registry.values().next();
  return first.done ? null : first.value.controller;
}

/** Get the controller for a specific root. */
export function getGraphControllerForRoot(root: string): GraphControllerLike | null {
  return registry.get(normalizeRoot(root))?.controller ?? null;
}

/**
 * Acquire a graph controller for a root. Creates + initializes if new,
 * increments ref-count if already exists.
 *
 * When system2.enabled is true, delegates to the compat registry so every
 * per-window acquire/release goes through System 2. The compat registry must
 * already have been initialized via initCompatRegistry() (done by
 * initCodebaseGraphSystem2 during startup) so _deps.db is the shared DB.
 * This keeps windowManager unchanged — it always imports from
 * graphControllerSupport via graphController.ts and gets the right impl.
 */
export async function acquireGraphController(root: string): Promise<GraphControllerLike> {
  const key = normalizeRoot(root);
  const existing = registry.get(key);
  if (existing) {
    existing.refCount++;
    return existing.controller;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic to avoid circular dep at module init
  const { getConfigValue } = require('../config') as typeof import('../config');
  const s2Settings = getConfigValue('system2') as { enabled: boolean } | undefined;

  if (s2Settings?.enabled) {
    // System 2 path: delegate to compat registry, which uses the shared DB
    // injected by initCompatRegistry() at startup. A new TreeSitterParser is
    // created per root (stateless once initialized) but the DB is shared.
    const compatRegistry = await import('./graphControllerCompatRegistry');
    const { IndexingPipeline } = await import('./indexingPipeline');
    const { TreeSitterParser } = await import('./treeSitterParser');
    const parser = new TreeSitterParser();
    await parser.init();
    const { GraphDatabase } = await import('./graphDatabase');
    // Reuse shared DB if startup already created it; otherwise open a new connection.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- _system2Db is typed as any to avoid eager import
    const db = _system2Db ?? new GraphDatabase();
    const pipeline = new IndexingPipeline(db, parser);
    const compat = await compatRegistry.acquireGraphController(root, pipeline);
    registry.set(key, { controller: compat, refCount: 1 });
    if (!defaultRoot) defaultRoot = key;
    return compat;
  }

  // System 1 path
  const { GraphController: GC } = await import('./graphController');
  const ctrl = new GC(root);
  await ctrl.initialize();
  registry.set(key, { controller: ctrl, refCount: 1 });
  return ctrl;
}

/** Release a ref. Disposes the controller when count hits 0. */
export async function releaseGraphController(root: string): Promise<void> {
  const key = normalizeRoot(root);
  const entry = registry.get(key);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount <= 0) {
    await entry.controller.dispose();
    registry.delete(key);
    if (defaultRoot === key) defaultRoot = null;
  }
}

/** Remove a disposed controller from the registry (called by dispose). */
export function unregisterGraphController(root: string, controller: GraphController): void {
  const key = normalizeRoot(root);
  if (registry.get(key)?.controller === controller) {
    registry.delete(key);
    if (defaultRoot === key) defaultRoot = null;
  }
}
