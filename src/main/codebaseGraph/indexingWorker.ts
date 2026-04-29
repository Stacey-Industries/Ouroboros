/**
 * indexingWorker.ts — Worker-thread entry point for the System 2 indexing pipeline.
 *
 * Opens its own GraphDatabase connection (WAL allows multiple independent
 * connections to the same file), constructs an IndexingPipeline, and processes
 * indexRepository requests one at a time via parentPort messaging.
 *
 * NOTE: Normally invoked via indexingWorkerClient — not imported directly by
 * main-process code.  The class is still directly usable for tests.
 */

import { parentPort, workerData } from 'worker_threads';

import { GraphDatabase } from './graphDatabase';
import { IndexingPipeline } from './indexingPipeline';
import type { IndexingProgress } from './indexingPipelineTypes';
import type {
  DisposeRequest,
  IndexingWorkerRequest,
  IndexingWorkerResponse,
  IndexRepositoryRequest,
} from './indexingWorkerTypes';
import { TreeSitterParser } from './treeSitterParser';

// ── Worker-local singletons ───────────────────────────────────────────────────

let db: GraphDatabase | null = null;
let parser: TreeSitterParser | null = null;
let pipeline: IndexingPipeline | null = null;
let disposed = false;

/**
 * Resolve the SQLite path the worker should open. Wave 53k follow-up
 * (H1): main thread passes its resolved `getDbPath()` via workerData
 * because `require('electron').app.getPath('userData')` from a worker
 * thread returns an unready/empty path on Electron — pre-fix the worker
 * fell back to `process.cwd()` and wrote to a separate db file from the
 * main thread, so file_hashes never reached the autoSync poll's view.
 */
function resolveWorkerDbPath(): string | undefined {
  const data = workerData as { dbPath?: string } | null | undefined;
  return data?.dbPath;
}

function getOrInitPipeline(): IndexingPipeline {
  if (pipeline) return pipeline;
  db = new GraphDatabase(resolveWorkerDbPath());
  parser = new TreeSitterParser();
  pipeline = new IndexingPipeline(db, parser);
  return pipeline;
}

function disposeResources(): void {
  try {
    parser?.dispose();
  } catch {
    /* parser cleanup best-effort */
  }
  try {
    db?.close();
  } catch {
    /* db close best-effort */
  }
  parser = null;
  db = null;
  pipeline = null;
}

// ── Messaging helpers ─────────────────────────────────────────────────────────

function post(msg: IndexingWorkerResponse): void {
  parentPort?.postMessage(msg);
}

// ── Request handler ───────────────────────────────────────────────────────────

async function handleIndexRepository(req: IndexRepositoryRequest): Promise<void> {
  if (disposed) {
    post({ type: 'error', requestId: req.requestId, message: 'Worker is disposed' });
    return;
  }
  const pl = getOrInitPipeline();

  const onProgress = (progress: IndexingProgress): void => {
    post({ type: 'progress', requestId: req.requestId, progress });
  };

  const result = await pl.index({ ...req.options, onProgress });
  post({ type: 'result', requestId: req.requestId, result });
}

function handleDispose(req: DisposeRequest): void {
  disposed = true;
  disposeResources();
  post({ type: 'disposed', requestId: req.requestId });
  // Exit on next tick so the ack message flushes before the worker thread dies.
  setImmediate(() => process.exit(0));
}

async function handleMessage(msg: IndexingWorkerRequest): Promise<void> {
  try {
    switch (msg.type) {
      case 'indexRepository':
        await handleIndexRepository(msg);
        break;
      case 'dispose':
        handleDispose(msg);
        break;
      default: {
        const unknownMsg = msg as IndexingWorkerRequest;
        post({
          type: 'error',
          requestId: unknownMsg.requestId,
          message: `Unknown request type: ${String(unknownMsg.type)}`,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    post({ type: 'error', requestId: msg.requestId, message, stack });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

parentPort?.on('message', (msg: IndexingWorkerRequest) => {
  void handleMessage(msg);
});
