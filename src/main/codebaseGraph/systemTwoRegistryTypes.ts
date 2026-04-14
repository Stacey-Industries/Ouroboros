/**
 * systemTwoRegistryTypes.ts — Type definitions for the System 2 per-root registry.
 *
 * System 2 uses a single global SQLite DB partitioned by project column.
 * The registry coordinates per-root watcher state, not per-root databases.
 */

import type { AutoSyncWatcher } from './autoSync'

// ─── Handle (public API) ──────────────────────────────────────────────────────

/** Read-only view of a registered root, returned to callers of acquire/getHandle. */
export interface SystemTwoHandle {
  /** Normalized absolute path (path.resolve, lower-cased on Windows). */
  readonly projectRoot: string
  /** Basename of projectRoot. */
  readonly projectName: string
  /** How many callers have acquired this root without releasing. */
  readonly refCount: number
  /** Active watcher, or null if creation is still pending. */
  readonly watcher: AutoSyncWatcher | null
  /** Unix ms timestamp when this entry was first created. */
  readonly createdAt: number
  /** Last known index status string (informational). */
  readonly lastIndexStatus: string
}

// ─── Internal registry entry ──────────────────────────────────────────────────

/** Mutable internal entry stored in the registry Map. */
export interface RegistryEntry {
  projectRoot: string
  projectName: string
  refCount: number
  watcher: AutoSyncWatcher | null
  createdAt: number
  lastIndexStatus: string
}
