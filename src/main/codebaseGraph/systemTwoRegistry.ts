/**
 * systemTwoRegistry.ts — Ref-counted per-root registry for System 2.
 *
 * System 2 uses a single global SQLite DB partitioned by project column.
 * This registry manages one AutoSyncWatcher per project root, coordinating
 * lifecycle (acquire / release) without owning the shared DB connection.
 */

import path from 'path';

import log from '../logger';
import { watchRecursive } from '../watchers';
import type { AutoSyncOptions } from './autoSync';
import { AutoSyncWatcher } from './autoSync';
import type { GraphDatabase } from './graphDatabase';
import type { IndexingPipeline } from './indexingPipeline';
import type { RegistryEntry, SystemTwoHandle } from './systemTwoRegistryTypes';

/**
 * Mirrors `WATCHER_IGNORE_GLOBS` in `src/main/ipc-handlers/files.ts` —
 * keep these in sync. Skips dotfiles, VCS, and common build outputs so
 * the indexer doesn't churn on `out/`, `dist/`, `node_modules/`, etc.
 */
const AUTOSYNC_WATCHER_IGNORE_GLOBS = [
  '**/.*/**',
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/coverage/**',
];

// ─── Module-level state ───────────────────────────────────────────────────────

const registry = new Map<string, RegistryEntry>();

// ─── Path normalization ───────────────────────────────────────────────────────

/**
 * Normalize a project root to a stable Map key.
 * - Windows: lower-case (case-insensitive FS) + forward slashes
 * - macOS/Linux: forward slashes only (case-sensitive)
 */
export function normalizeRoot(input: string): string {
  const resolved = path.resolve(input).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// ─── Handle projection ────────────────────────────────────────────────────────

function toHandle(entry: RegistryEntry): SystemTwoHandle {
  return {
    projectRoot: entry.projectRoot,
    projectName: entry.projectName,
    refCount: entry.refCount,
    watcher: entry.watcher,
    createdAt: entry.createdAt,
    lastIndexStatus: entry.lastIndexStatus,
  };
}

// ─── Watcher construction helpers ────────────────────────────────────────────

interface BuildWatcherOptsArgs {
  projectRoot: string;
  projectName: string;
  db: GraphDatabase;
  pipeline: IndexingPipeline;
  entry: RegistryEntry;
}

function buildWatcherOpts({
  projectRoot,
  projectName,
  db,
  pipeline,
  entry,
}: BuildWatcherOptsArgs): AutoSyncOptions {
  return {
    projectRoot,
    projectName,
    db,
    pipeline,
    onReindexComplete: (result) => {
      entry.lastIndexStatus = `complete:${result.filesChanged}files:${result.durationMs}ms`;
      log.info(`[s2-registry] reindex complete for ${projectName}`, result);
    },
    onError: (err) => {
      entry.lastIndexStatus = `error:${err.message}`;
      log.warn(`[s2-registry] watcher error for ${projectName}:`, err);
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Acquire a handle for the given project root.
 * Creates an AutoSyncWatcher on first acquire; increments refCount on repeat.
 * The watcher runs onLaunchDiff then starts polling.
 */
export async function acquire(
  projectRoot: string,
  db: GraphDatabase,
  pipeline: IndexingPipeline,
): Promise<SystemTwoHandle> {
  const key = normalizeRoot(projectRoot);
  const existing = registry.get(key);

  if (existing) {
    existing.refCount++;
    log.info(`[s2-registry] acquire (refCount=${existing.refCount}) ${existing.projectName}`);
    return toHandle(existing);
  }

  const projectName = path.basename(path.resolve(projectRoot));
  const entry: RegistryEntry = {
    projectRoot: path.resolve(projectRoot).replace(/\\/g, '/'),
    projectName,
    refCount: 1,
    watcher: null,
    nativeWatcherSubscription: null,
    createdAt: Date.now(),
    lastIndexStatus: 'initializing',
  };
  registry.set(key, entry);

  const opts = buildWatcherOpts({ projectRoot, projectName, db, pipeline, entry });
  const watcher = new AutoSyncWatcher(opts);
  entry.watcher = watcher;

  await watcher.initWithLaunchDiff();
  watcher.start();

  // Wave 53k follow-up (H3): wire @parcel/watcher into AutoSyncWatcher.
  // Pre-fix `receiveWatcherEvent` had zero callers; new-file creation was
  // invisible to the poll loop because `collectChangedFiles` only iterates
  // existing-in-DB hashes. Native events catch creation, modification, and
  // deletion within the OS-level coalescing window.
  entry.nativeWatcherSubscription = await subscribeNativeWatcher(projectRoot, watcher);

  entry.lastIndexStatus = 'running';
  log.info(`[s2-registry] acquired (new) ${projectName}`);
  return toHandle(entry);
}

async function subscribeNativeWatcher(
  projectRoot: string,
  watcher: AutoSyncWatcher,
): Promise<RegistryEntry['nativeWatcherSubscription']> {
  try {
    return await watchRecursive(
      projectRoot,
      { ignore: AUTOSYNC_WATCHER_IGNORE_GLOBS },
      (event) => watcher.receiveWatcherEvent(event.path),
    );
  } catch (err) {
    // Native watcher subscription is best-effort — autoSync degrades to
    // poll-only if the OS-level subscription fails (e.g., permissions,
    // unsupported FS). Log and continue without throwing.
    log.warn(`[s2-registry] native watcher subscribe failed for ${projectRoot}:`, err);
    return null;
  }
}

/**
 * Release a previously acquired root.
 * Decrements refCount. Disposes the watcher and removes the entry when count
 * reaches zero. Does NOT close the shared GraphDatabase.
 */
export async function release(projectRoot: string): Promise<void> {
  const key = normalizeRoot(projectRoot);
  const entry = registry.get(key);
  if (!entry) return;

  entry.refCount--;
  log.info(`[s2-registry] release (refCount=${entry.refCount}) ${entry.projectName}`);

  if (entry.refCount <= 0) {
    await closeNativeSubscription(entry);
    entry.watcher?.dispose();
    registry.delete(key);
    log.info(`[s2-registry] disposed ${entry.projectName}`);
  }
}

async function closeNativeSubscription(entry: RegistryEntry): Promise<void> {
  if (!entry.nativeWatcherSubscription) return;
  try {
    await entry.nativeWatcherSubscription.close();
  } catch (err) {
    log.warn(`[s2-registry] native watcher close failed for ${entry.projectName}:`, err);
  }
  entry.nativeWatcherSubscription = null;
}

/** Read-only lookup. Returns null if root is not registered. */
export function getHandle(projectRoot: string): SystemTwoHandle | null {
  const entry = registry.get(normalizeRoot(projectRoot));
  return entry ? toHandle(entry) : null;
}

/** List all active (refCount > 0) handles — for observability. */
export function listActive(): SystemTwoHandle[] {
  return Array.from(registry.values()).map(toHandle);
}

/** Dispose all watchers and clear the registry. Call on app shutdown. */
export async function disposeAll(): Promise<void> {
  const entries = Array.from(registry.values());
  for (const entry of entries) {
    await closeNativeSubscription(entry);
    entry.watcher?.dispose();
  }
  registry.clear();
  log.info('[s2-registry] disposeAll complete');
}
