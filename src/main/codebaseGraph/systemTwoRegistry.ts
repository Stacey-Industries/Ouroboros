/**
 * systemTwoRegistry.ts — Ref-counted per-root registry for System 2.
 *
 * System 2 uses a single global SQLite DB partitioned by project column.
 * This registry manages one AutoSyncWatcher per project root, coordinating
 * lifecycle (acquire / release) without owning the shared DB connection.
 */

import path from 'path'

import log from '../logger'
import type { AutoSyncOptions } from './autoSync'
import { AutoSyncWatcher } from './autoSync'
import type { GraphDatabase } from './graphDatabase'
import type { IndexingPipeline } from './indexingPipeline'
import type { RegistryEntry, SystemTwoHandle } from './systemTwoRegistryTypes'

// ─── Module-level state ───────────────────────────────────────────────────────

const registry = new Map<string, RegistryEntry>()

// ─── Path normalization ───────────────────────────────────────────────────────

/**
 * Normalize a project root to a stable Map key.
 * - Windows: lower-case (case-insensitive FS) + forward slashes
 * - macOS/Linux: forward slashes only (case-sensitive)
 */
export function normalizeRoot(input: string): string {
  const resolved = path.resolve(input).replace(/\\/g, '/')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
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
  }
}

// ─── Watcher construction helpers ────────────────────────────────────────────

function buildWatcherOpts(
  projectRoot: string,
  projectName: string,
  db: GraphDatabase,
  pipeline: IndexingPipeline,
  entry: RegistryEntry,
): AutoSyncOptions {
  return {
    projectRoot,
    projectName,
    db,
    pipeline,
    onReindexComplete: (result) => {
      entry.lastIndexStatus = `complete:${result.filesChanged}files:${result.durationMs}ms`
      log.info(`[s2-registry] reindex complete for ${projectName}`, result)
    },
    onError: (err) => {
      entry.lastIndexStatus = `error:${err.message}`
      log.warn(`[s2-registry] watcher error for ${projectName}:`, err)
    },
  }
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
  const key = normalizeRoot(projectRoot)
  const existing = registry.get(key)

  if (existing) {
    existing.refCount++
    log.info(`[s2-registry] acquire (refCount=${existing.refCount}) ${existing.projectName}`)
    return toHandle(existing)
  }

  const projectName = path.basename(path.resolve(projectRoot))
  const entry: RegistryEntry = {
    projectRoot: path.resolve(projectRoot).replace(/\\/g, '/'),
    projectName,
    refCount: 1,
    watcher: null,
    createdAt: Date.now(),
    lastIndexStatus: 'initializing',
  }
  registry.set(key, entry)

  const opts = buildWatcherOpts(projectRoot, projectName, db, pipeline, entry)
  const watcher = new AutoSyncWatcher(opts)
  entry.watcher = watcher

  await watcher.initWithLaunchDiff()
  watcher.start()

  entry.lastIndexStatus = 'running'
  log.info(`[s2-registry] acquired (new) ${projectName}`)
  return toHandle(entry)
}

/**
 * Release a previously acquired root.
 * Decrements refCount. Disposes the watcher and removes the entry when count
 * reaches zero. Does NOT close the shared GraphDatabase.
 */
export async function release(projectRoot: string): Promise<void> {
  const key = normalizeRoot(projectRoot)
  const entry = registry.get(key)
  if (!entry) return

  entry.refCount--
  log.info(`[s2-registry] release (refCount=${entry.refCount}) ${entry.projectName}`)

  if (entry.refCount <= 0) {
    entry.watcher?.dispose()
    registry.delete(key)
    log.info(`[s2-registry] disposed ${entry.projectName}`)
  }
}

/** Read-only lookup. Returns null if root is not registered. */
export function getHandle(projectRoot: string): SystemTwoHandle | null {
  const entry = registry.get(normalizeRoot(projectRoot))
  return entry ? toHandle(entry) : null
}

/** List all active (refCount > 0) handles — for observability. */
export function listActive(): SystemTwoHandle[] {
  return Array.from(registry.values()).map(toHandle)
}

/** Dispose all watchers and clear the registry. Call on app shutdown. */
export async function disposeAll(): Promise<void> {
  const entries = Array.from(registry.values())
  for (const entry of entries) {
    entry.watcher?.dispose()
  }
  registry.clear()
  log.info('[s2-registry] disposeAll complete')
}
