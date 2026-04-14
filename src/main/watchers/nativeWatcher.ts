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

/**
 * Platform-appropriate backend. Passing an explicit backend avoids the
 * default-branch watchman probe (popen("watchman --output-encoding=bser
 * get-sockname") in @parcel/watcher's Backend.cc:40), whose stderr on
 * Windows shells prints "'watchman' is not recognized as an internal or
 * external command". We never use the watchman backend; forcing the OS
 * native backend keeps behavior identical and silences the probe.
 */
function defaultBackend(): 'windows' | 'fs-events' | 'inotify' | 'brute-force' {
  switch (process.platform) {
    case 'win32': return 'windows'
    case 'darwin': return 'fs-events'
    case 'linux': return 'inotify'
    default: return 'brute-force'
  }
}

export async function watchRecursive(
  rootPath: string,
  opts: WatchOptions,
  onEvent: WatchCallback,
): Promise<WatchSubscription> {
  const subscribeOpts: Parameters<typeof watcher.subscribe>[2] = {
    backend: defaultBackend(),
    ...(opts.ignore ? { ignore: opts.ignore } : {}),
  }
  const subscription = await watcher.subscribe(
    rootPath,
    (err, events) => {
      if (err) {
        log.warn(`[watcher] error on ${rootPath}:`, err.message)
        return
      }
      for (const e of events) onEvent({ type: e.type, path: e.path })
    },
    subscribeOpts,
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
