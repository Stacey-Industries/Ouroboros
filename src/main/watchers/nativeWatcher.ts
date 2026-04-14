/**
 * nativeWatcher.ts — thin wrapper around @parcel/watcher.
 *
 * Callers get recursive, cross-platform file system watching backed by native
 * OS APIs (ReadDirectoryChangesW on Windows, FSEvents on macOS, inotify on
 * Linux). One subscription handle per watched tree — avoids the per-directory
 * FD explosion that chokidar's pure-JS implementation suffers from.
 */

import watcher from '@parcel/watcher'

import log from '../logger'
import type {
  WatchCallback,
  WatchOptions,
  WatchSubscription,
} from './nativeWatcher.types'

export async function watchRecursive(
  rootPath: string,
  opts: WatchOptions,
  onEvent: WatchCallback,
): Promise<WatchSubscription> {
  const subscription = await watcher.subscribe(
    rootPath,
    (err, events) => {
      if (err) {
        log.warn(`[watcher] error on ${rootPath}:`, err.message)
        return
      }
      for (const e of events) onEvent({ type: e.type, path: e.path })
    },
    opts.ignore ? { ignore: opts.ignore } : undefined,
  )

  return {
    close: async () => {
      try {
        await subscription.unsubscribe()
      } catch (err) {
        // Native unsubscribe can race with process shutdown; log but don't throw.
        log.warn(`[watcher] unsubscribe failed for ${rootPath}:`, err)
      }
    },
  }
}
