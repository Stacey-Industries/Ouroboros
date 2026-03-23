/**
 * graphWorker.ts — Worker thread for CPU-bound tree-sitter indexing.
 *
 * Runs tree-sitter WASM parsing off the main thread so the Electron
 * event loop stays responsive during full-repo indexing (15-20s).
 *
 * Receives WorkerRequest messages, sends WorkerResponse messages.
 * TreeCache and all WASM memory live here — never cross the thread boundary.
 */

import { parentPort } from 'worker_threads';

import { indexAllFiles, reindexSingleFile, TreeCache } from './graphIndexing';
import { initTreeSitter, resolveEdgeReferences } from './graphParser';
import { GraphStore } from './graphStore';
import type { WorkerRequest, WorkerResponse } from './graphWorkerTypes';

// ── Worker-local state ────────────────────────────────────────────

const treeCache = new TreeCache();
let treeSitterReady = false;

// ── Helpers ───────────────────────────────────────────────────────

function post(msg: WorkerResponse): void {
  parentPort?.postMessage(msg);
}

async function ensureTreeSitter(): Promise<void> {
  if (treeSitterReady) return;
  await initTreeSitter();
  treeSitterReady = true;
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleIndexAll(req: WorkerRequest & { type: 'indexAll' }): Promise<void> {
  const start = Date.now();
  await ensureTreeSitter();

  const store = new GraphStore(req.projectRoot);
  const ctx = { store, treeCache, rootPath: req.projectRoot };
  await indexAllFiles(ctx, req.projectRoot, req.incremental);

  const nodes = store.getAllNodes();
  const edges = store.getAllEdges();
  post({
    type: 'indexComplete',
    nodes,
    edges,
    durationMs: Date.now() - start,
  });
}

async function handleReindexFiles(req: WorkerRequest & { type: 'reindexFiles' }): Promise<void> {
  await ensureTreeSitter();

  const store = new GraphStore(req.projectRoot);
  const ctx = { store, treeCache, rootPath: req.projectRoot };
  const removedRelPaths: string[] = [];

  for (const filePath of req.paths) {
    await reindexSingleFile(ctx, filePath);
  }

  const allNodes = store.getAllNodes();
  const allEdges = store.getAllEdges();
  const resolved = resolveEdgeReferences(allNodes, allEdges);

  post({
    type: 'reindexComplete',
    nodes: allNodes,
    edges: resolved,
    removedRelPaths,
  });
}

async function handleReindexSingle(req: WorkerRequest & { type: 'reindexSingle' }): Promise<void> {
  await ensureTreeSitter();

  const store = new GraphStore(req.projectRoot);
  const ctx = { store, treeCache, rootPath: req.projectRoot };
  await reindexSingleFile(ctx, req.fullPath);

  const allNodes = store.getAllNodes();
  const allEdges = store.getAllEdges();
  const resolved = resolveEdgeReferences(allNodes, allEdges);

  post({
    type: 'reindexComplete',
    nodes: allNodes,
    edges: resolved,
    removedRelPaths: [],
  });
}

// ── Message router ────────────────────────────────────────────────

async function handleMessage(msg: WorkerRequest): Promise<void> {
  try {
    switch (msg.type) {
      case 'indexAll':
        await handleIndexAll(msg);
        break;
      case 'reindexFiles':
        await handleReindexFiles(msg);
        break;
      case 'reindexSingle':
        await handleReindexSingle(msg);
        break;
      default:
        post({ type: 'error', message: `Unknown request type`, requestType: 'unknown' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'error', message, requestType: msg.type });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────

parentPort?.on('message', (msg: WorkerRequest) => {
  void handleMessage(msg);
});

post({ type: 'ready' });
