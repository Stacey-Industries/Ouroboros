/**
 * repoMapWorker.ts — Worker-thread entry point for generateRepoMap.
 *
 * Receives workerData: { dbPath: string } from the main thread (dbPath is
 * resolved there because require('electron').app.getPath('userData') is
 * unavailable in worker threads — same pattern as indexingWorker.ts).
 *
 * Phase 1: calls in-process generateRepoMap directly (no WorkerQueryClient).
 * Phase 2 will wire a read-only SQLite connection for graph queries.
 */

import { parentPort, workerData } from 'worker_threads';

import log from '../logger';
import { generateRepoMap } from './repoMapGenerator';
import type {
  GenerateRepoMapRequest,
  RepoMapWorkerRequest,
  RepoMapWorkerResponse,
} from './repoMapWorkerTypes';

// ── Messaging helper ──────────────────────────────────────────────────────────

function post(msg: RepoMapWorkerResponse): void {
  parentPort?.postMessage(msg);
}

// ── Request handler ───────────────────────────────────────────────────────────

async function handleGenerateRepoMap(req: GenerateRepoMapRequest): Promise<void> {
  const t0 = Date.now();
  try {
    const repoMap = await generateRepoMap({
      repoFacts: req.repoFacts,
      repoIndex: req.repoIndex,
      workspaceRoot: req.workspaceRoot,
      model: req.model,
    });
    post({ type: 'repoMapReady', id: req.id, repoMap, durationMs: Date.now() - t0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[repoMapWorker] generateRepoMap error: ${message}`);
    post({ type: 'error', id: req.id, message });
  }
}

// ── Message router ────────────────────────────────────────────────────────────

async function handleMessage(msg: RepoMapWorkerRequest): Promise<void> {
  switch (msg.type) {
    case 'generateRepoMap':
      await handleGenerateRepoMap(msg);
      break;
    default: {
      const unknown = msg as RepoMapWorkerRequest;
      log.warn(`[repoMapWorker] unknown message type: ${String(unknown.type)}`);
    }
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// dbPath is passed via workerData so the worker can open its own read-only
// SQLite connection in Phase 2 without calling getDbPath() (which requires
// the Electron app module — unavailable in worker threads).
const _dbPath = (workerData as { dbPath?: string } | null)?.dbPath;
log.info(`[repoMapWorker] starting dbPath=${_dbPath ?? '(none)'}`);

parentPort?.on('message', (msg: RepoMapWorkerRequest) => {
  void handleMessage(msg);
});

post({ type: 'ready' });
