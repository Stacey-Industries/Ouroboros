/**
 * agentChatContext.ts — Context cache and worker management for agent chat.
 *
 * Manages the eagerly-built repo snapshot cache and context worker thread.
 * Exported functions are used by agentChat.ts (IPC handlers) and
 * agentChatOrchestration.ts (task creation).
 */

import fs from 'fs/promises';
import path from 'path';
import { Worker } from 'worker_threads';

import log from '../logger';
import {
  buildGraphSummary,
  formatGraphSummary,
  type GraphSummary,
} from '../orchestration/graphSummaryBuilder';
import type { RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { ContextPacket } from '../orchestration/types';
import { buildWorkerPipeAuthSeed } from '../pipeAuth';

/**
 * Eagerly-built repo snapshot cache.
 *
 * Built once on startup (or when workspace roots change) so that by the
 * time the user sends their first chat message the context is already warm.
 * Invalidated by file-system events and git operations.
 */
export interface CachedContext {
  snapshot: RepoIndexSnapshot;
  graphSummary: GraphSummary;
  builtAt: number;
  /** Pre-built context packet — avoids rebuilding on every createTask. */
  cachedPacket?: ContextPacket;
  /** The model the cached packet was built for. */
  cachedPacketModel?: string;
}

export const contextCache = new Map<string, CachedContext>();
const contextBuildInFlight = new Set<string>();
const CONTEXT_REFRESH_MS = 300_000; // refresh every 5 min

export function cacheKey(roots: string[]): string {
  return [...roots].sort().join('|');
}

// ── Disk persistence ──────────────────────────────────────────────────

function getContextCachePath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- electron not available in worker context; dynamic require needed
    const { app } = require('electron') as typeof import('electron');
    return path.join(app.getPath('userData'), 'context-cache.json');
  } catch {
    return '';
  }
}

/** Save the context cache to disk (best-effort, non-blocking). */
function persistContextCache(): void {
  const cachePath = getContextCachePath();
  if (!cachePath) return;
  try {
    const entries: Array<
      [string, Omit<CachedContext, 'cachedPacket'> & { cachedPacket?: unknown }]
    > = [];
    for (const [key, entry] of contextCache) {
      entries.push([
        key,
        { snapshot: entry.snapshot, graphSummary: entry.graphSummary, builtAt: entry.builtAt },
      ]);
    }
    const data = JSON.stringify(entries);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- cachePath is derived from app.getPath('userData'), not user input
    fs.writeFile(cachePath, data, 'utf-8').catch(() => {});
  } catch {
    /* non-fatal */
  }
}

/** Load persisted context cache from disk on startup. */
export function loadPersistedContextCache(): void {
  const cachePath = getContextCachePath();
  if (!cachePath) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync fs needed at startup before async context is available
    const fsSync = require('fs') as typeof import('fs');
    if (!fsSync.existsSync(cachePath)) return;
    const data = fsSync.readFileSync(cachePath, 'utf-8');
    const entries: Array<[string, CachedContext]> = JSON.parse(data);
    for (const [key, entry] of entries) {
      contextCache.set(key, entry);
    }
    log.info(`Loaded persisted context cache (${entries.length} entries)`);
  } catch (err) {
    log.warn('Failed to load persisted context cache:', err);
  }
}

// ── Context worker management ─────────────────────────────────────────

let contextWorker: Worker | null = null;

function getWorkerPath(): string {
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  return path.join(outMainDir, 'contextWorker.js');
}

function ensureContextWorker(): Worker | null {
  if (contextWorker) return contextWorker;
  const workerPath = getWorkerPath();
  try {
    contextWorker = new Worker(workerPath, { workerData: buildWorkerPipeAuthSeed() });
    contextWorker.on('message', handleContextWorkerMessage);
    contextWorker.on('error', (err) => {
      log.warn('context worker error:', err);
      contextWorker = null;
    });
    contextWorker.on('exit', (code) => {
      if (code !== 0) log.warn('context worker exited with code', code);
      contextWorker = null;
    });
    return contextWorker;
  } catch (err) {
    log.warn('Failed to create context worker:', err);
    return null;
  }
}

type WorkerMessage = {
  type: string;
  id?: string;
  snapshot?: RepoIndexSnapshot;
  packet?: ContextPacket;
  durationMs?: number;
  message?: string;
};

function handleContextWorkerMessage(msg: WorkerMessage): void {
  if (msg.type === 'ready') {
    log.info('context worker ready');
    return;
  }
  if (msg.type === 'error') {
    log.warn('context worker error for', msg.id, ':', msg.message);
    contextBuildInFlight.delete(msg.id ?? '');
    return;
  }
  if (msg.type === 'contextReady' && msg.id && msg.snapshot) {
    onContextReady(msg.id, msg.snapshot, msg.packet, msg.durationMs ?? 0);
  }
}

function attachGraphSummary(entry: CachedContext, key: string): void {
  void buildGraphSummary()
    .catch(() => ({ hotspots: [], blastRadius: [], builtAt: 0 }) as GraphSummary)
    .then((gs) => {
      entry.graphSummary = gs;
      if (entry.cachedPacket) {
        const section = formatGraphSummary(gs);
        if (section) entry.cachedPacket.graphSummary = section;
      }
    })
    .finally(() => {
      contextBuildInFlight.delete(key);
    });
}

function onContextReady(
  id: string,
  snapshot: RepoIndexSnapshot,
  packet: ContextPacket | undefined,
  durationMs: number,
): void {
  const roots = id.split('|');
  const key = cacheKey(roots);
  const entry: CachedContext = {
    snapshot,
    graphSummary: { hotspots: [], blastRadius: [], builtAt: 0 },
    builtAt: Date.now(),
    cachedPacket: packet,
  };
  contextCache.set(key, entry);
  log.info('Context cache built via worker in', durationMs, 'ms for key:', key);
  persistContextCache();
  attachGraphSummary(entry, key);
}

/** Trigger a background build of repo snapshot in a worker thread. */
export function warmSnapshotCache(roots: string[]): void {
  if (!roots.length) return;
  const key = cacheKey(roots);
  if (contextBuildInFlight.has(key)) return;
  const worker = ensureContextWorker();
  if (!worker) return;
  contextBuildInFlight.add(key);
  worker.postMessage({ type: 'buildContext', id: key, roots });
}

/** Terminate the context worker (call on app shutdown). */
export function terminateContextWorker(): void {
  if (contextWorker) {
    contextWorker.terminate().catch(() => {});
    contextWorker = null;
  }
}

/**
 * Get cached context synchronously. Returns whatever is cached immediately.
 */
export function getCachedContext(roots: string[]): CachedContext | null {
  return contextCache.get(cacheKey(roots)) ?? null;
}

// ── Periodic refresh timer ────────────────────────────────────────────

let contextRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function startContextRefreshTimer(roots: string[]): void {
  if (contextRefreshTimer) {
    clearInterval(contextRefreshTimer);
    contextRefreshTimer = null;
  }
  log.info('Starting context refresh timer for roots:', roots);
  log.info('Current cache size:', contextCache.size, 'keys:', [...contextCache.keys()]);
  setTimeout(() => {
    log.info('Initial warm-up triggered for roots:', roots);
    warmSnapshotCache(roots);
  }, 5_000);
  contextRefreshTimer = setInterval(() => warmSnapshotCache(roots), CONTEXT_REFRESH_MS);
}

export function stopContextRefreshTimer(): void {
  if (contextRefreshTimer) {
    clearInterval(contextRefreshTimer);
    contextRefreshTimer = null;
  }
}

/**
 * Mark cached context as stale to trigger a background refresh on next timer tick.
 */
export function invalidateSnapshotCache(roots?: string[]): void {
  if (roots) {
    const entry = contextCache.get(cacheKey(roots));
    if (entry) entry.builtAt = 0;
  } else {
    for (const entry of contextCache.values()) entry.builtAt = 0;
  }
}
