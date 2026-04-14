/**
 * Shared types for the native recursive file watcher. All watcher consumers
 * (files.ts, rulesWatcher.ts, config.ts) depend on these shapes; they are
 * the contract between the @parcel/watcher wrapper and its callers.
 */

export type WatchEventType = 'create' | 'update' | 'delete'

export interface WatchEvent {
  type: WatchEventType
  /** Absolute path to the affected file or directory. */
  path: string
}

export interface WatchOptions {
  /**
   * Glob patterns (@parcel/watcher-compatible) to exclude from watching.
   * Example: ['**\/node_modules/**', '**\/.git/**']
   */
  ignore?: string[]
}

export interface WatchSubscription {
  /** Stop the watcher and release native resources. */
  close: () => Promise<void>
}

export type WatchCallback = (event: WatchEvent) => void
