/**
 * repoMapWorkerClient.ts — Main-process singleton client for the repoMap worker.
 *
 * Lazy-spawns a Worker on the first generateRepoMap call. Queues messages
 * until the worker emits 'ready', then flushes. Each in-flight request is
 * keyed by a unique id so concurrent calls resolve independently.
 *
 * On worker crash, all pending promises are rejected and the worker slot is
 * nulled so the next call spawns a fresh one.
 */

import path from 'path';
import { Worker } from 'worker_threads';

import { getDbPath } from '../codebaseGraph/graphDatabaseHelpers';
import log from '../logger';
import type { RepoMap } from './contextLayerTypes';
import type {
  GenerateRepoMapRequest,
  RepoMapWorkerResponse,
} from './repoMapWorkerTypes';

// ── Path resolution (dev vs packaged asar) ────────────────────────────────────

function resolveWorkerPath(): string {
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  return path.join(outMainDir, 'repoMapWorker.js');
}

function buildWorkerData(): { dbPath: string } {
  return { dbPath: getDbPath() };
}

// ── Pending-request bookkeeping ───────────────────────────────────────────────

interface PendingRequest {
  resolve: (repoMap: RepoMap) => void;
  reject: (err: Error) => void;
  /** Stored so rejectAll can attach a no-op catch, suppressing unhandled-rejection
   *  warnings when callers discard the promise (e.g. `void client.generateRepoMap()`). */
  promise: Promise<RepoMap>;
}

// ── Client class ──────────────────────────────────────────────────────────────

export class RepoMapWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private messageQueue: GenerateRepoMapRequest[] = [];
  private ready = false;
  private nextId = 0;

  // ── Public API ──────────────────────────────────────────────────────────────

  generateRepoMap(opts: unknown): Promise<RepoMap> {
    let storedResolve!: (repoMap: RepoMap) => void;
    let storedReject!: (err: Error) => void;
    const promise = new Promise<RepoMap>((resolve, reject) => {
      storedResolve = resolve;
      storedReject = reject;
    });
    // Attach a no-op catch so callers that discard the promise (void expr)
    // do not trigger unhandled-rejection warnings when rejectAll fires.
    promise.catch(() => undefined);
    const id = String(this.nextId++);
    this.pending.set(id, { resolve: storedResolve, reject: storedReject, promise });
    const msg = this.buildRequest(id, opts);
    if (this.ready) {
      this.ensureWorker().postMessage(msg);
    } else {
      this.messageQueue.push(msg);
      this.ensureWorker();
    }
    return promise;
  }

  async dispose(): Promise<void> {
    this.rejectAll(new Error('RepoMapWorkerClient disposed'));
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    this.messageQueue = [];
    if (!worker) return;
    try {
      await worker.terminate();
    } catch {
      /* already gone */
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private buildRequest(id: string, opts: unknown): GenerateRepoMapRequest {
    const o = opts as {
      repoFacts: GenerateRepoMapRequest['repoFacts'];
      repoIndex: GenerateRepoMapRequest['repoIndex'];
      workspaceRoot: string;
      model?: string;
    };
    return {
      type: 'generateRepoMap',
      id,
      repoFacts: o.repoFacts,
      repoIndex: o.repoIndex,
      workspaceRoot: o.workspaceRoot,
      model: o.model,
    };
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(resolveWorkerPath(), { workerData: buildWorkerData() });

    worker.on('message', (msg: RepoMapWorkerResponse) => {
      this.handleMessage(msg);
    });

    worker.on('error', (err) => {
      log.error('[repoMapWorker] worker error:', err);
      this.rejectAll(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        log.warn(`[repoMapWorker] exited with code ${code}`);
        this.rejectAll(new Error(`Worker exited with code ${code}`));
      }
      if (this.worker === worker) {
        this.worker = null;
        this.ready = false;
      }
    });

    this.worker = worker;
    return worker;
  }

  private handleMessage(msg: RepoMapWorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        this.flushQueue();
        break;
      case 'repoMapReady':
        this.settle(msg.id, (p) => p.resolve(msg.repoMap));
        break;
      case 'error':
        this.settle(msg.id, (p) => p.reject(new Error(msg.message)));
        break;
    }
  }

  private flushQueue(): void {
    const worker = this.worker;
    if (!worker) return;
    for (const msg of this.messageQueue) {
      worker.postMessage(msg);
    }
    this.messageQueue = [];
  }

  private settle(id: string, fn: (p: PendingRequest) => void): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    fn(p);
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.messageQueue = [];
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _client: RepoMapWorkerClient | null = null;

export function getRepoMapWorkerClient(): RepoMapWorkerClient {
  _client ??= new RepoMapWorkerClient();
  return _client;
}

export async function disposeRepoMapWorkerClient(): Promise<void> {
  await _client?.dispose();
  _client = null;
}
