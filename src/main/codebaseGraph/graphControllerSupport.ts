/**
 * graphControllerSupport.ts — Singleton management and helpers
 * extracted from graphController.ts to satisfy max-lines.
 */

import path from 'path';

import type { GraphController } from './graphController';
import type { GraphStore } from './graphStore';
import type { GraphEdge } from './graphTypes';

export function isTraceObject(trace: unknown): boolean {
  return typeof trace === 'object' && trace !== null && 'source' in trace && 'target' in trace;
}

export function ingestTracesIntoStore(
  store: GraphStore,
  traces: unknown[],
): { success: boolean; ingested: number } {
  let ingested = 0;
  if (!Array.isArray(traces)) return { success: false, ingested: 0 };
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
  if (ingested > 0) {
    store.save().catch((e: unknown) => console.error('[codebase-graph] Save after trace:', e));
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

// ── Singleton ─────────────────────────────────────────────────────

let instance: GraphController | null = null;

export function getGraphController(): GraphController | null {
  return instance;
}

export function setGraphController(controller: GraphController): void {
  instance = controller;
}
