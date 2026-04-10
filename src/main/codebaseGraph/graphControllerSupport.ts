/**
 * graphControllerSupport.ts — Singleton management and helpers
 * extracted from graphController.ts to satisfy max-lines.
 */

import path from 'path';

import log from '../logger';
import type { GraphController } from './graphController';
import type { IGraphStore } from './graphStoreTypes';
import type { GraphEdge, GraphNode } from './graphTypes';

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

interface RegistryEntry {
  controller: GraphController;
  refCount: number;
}

const registry = new Map<string, RegistryEntry>();
let defaultRoot: string | null = null;

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Legacy setter — registers as the default root instance. */
export function setGraphController(controller: GraphController): void {
  const key = normalizeRoot(controller.rootPath);
  defaultRoot = key;
  registry.set(key, { controller, refCount: 1 });
}

/**
 * Backward-compat getter — returns the default root's controller.
 * Callers without root context use this.
 */
export function getGraphController(): GraphController | null {
  if (defaultRoot) return registry.get(defaultRoot)?.controller ?? null;
  const first = registry.values().next();
  return first.done ? null : first.value.controller;
}

/** Get the controller for a specific root. */
export function getGraphControllerForRoot(root: string): GraphController | null {
  return registry.get(normalizeRoot(root))?.controller ?? null;
}

/**
 * Acquire a graph controller for a root. Creates + initializes if
 * new, increments ref-count if already exists.
 */
export async function acquireGraphController(root: string): Promise<GraphController> {
  const key = normalizeRoot(root);
  const existing = registry.get(key);
  if (existing) {
    existing.refCount++;
    return existing.controller;
  }

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
