/**
 * memoryWatcher.ts — Watches the project memory directory for changes and
 * emits a 'memory:changed' event to all renderer webContents when MEMORY.md
 * or any linked .md file is added / modified / deleted.
 *
 * Same pattern as rulesWatcher.ts: watchRecursive + 500 ms debounce.
 */

import { BrowserWindow } from 'electron';

import log from '../logger';
import type { WatchSubscription } from '../watchers';
import { watchRecursive } from '../watchers';
import { broadcastToWebClients } from '../web/webServer';
import { getProjectMemoryDir } from './memoryReader';

const DEBOUNCE_MS = 500;

function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('memory:changed');
  }
  broadcastToWebClients('memory:changed', {});
}

function createDebouncedBroadcast(onChanged: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChanged();
    }, DEBOUNCE_MS);
  };
}

async function subscribeMemDir(
  dir: string,
  debounced: () => void,
): Promise<WatchSubscription | null> {
  try {
    return await watchRecursive(dir, { ignore: [] }, (event) => {
      if (event.path.endsWith('.md')) debounced();
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      log.info('[memoryWatcher] memory dir not yet present, skipping watch:', dir);
      return null;
    }
    log.warn('[memoryWatcher] watchRecursive failed:', dir, err);
    return null;
  }
}

/**
 * Start watching the memory directory for the given project cwd.
 * Returns a stop function that tears down the subscription.
 */
export function startMemoryWatcher(cwd: string): () => void {
  const memDir = getProjectMemoryDir(cwd);
  const debounced = createDebouncedBroadcast(broadcastChanged);

  let subscription: WatchSubscription | null = null;
  const ready = subscribeMemDir(memDir, debounced).then((sub) => {
    subscription = sub;
  });

  return () => {
    void ready.then(async () => {
      if (subscription) await subscription.close();
    });
  };
}
