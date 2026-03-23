/**
 * directoryWatchRegistry.ts — Multiplexes directory watch subscriptions.
 *
 * Multiple components can subscribe to the same directory. The registry
 * tracks reference counts and only calls the IPC watchDir/unwatchDir
 * when the first subscriber arrives or last subscriber leaves.
 */

import type { FileChangeEvent } from '../types/electron-foundation';

type ChangeCallback = (change: FileChangeEvent) => void;

// Module-level state
const subscribers = new Map<string, Set<ChangeCallback>>();
let globalCleanup: (() => void) | null = null;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function notifySubscribers(cbs: Set<ChangeCallback>, change: FileChangeEvent): void {
  for (const cb of cbs) {
    try {
      cb(change);
    } catch {
      // swallow listener errors to avoid one bad callback breaking others
    }
  }
}

function ensureGlobalListener(): void {
  if (globalCleanup) return;
  if (!window.electronAPI?.files?.onFileChange) return;

  globalCleanup = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
    const normalizedChange = normalizePath(change.path);

    for (const [dirPath, cbs] of subscribers) {
      const normalizedDir = normalizePath(dirPath);
      if (normalizedChange.startsWith(normalizedDir)) {
        notifySubscribers(cbs, change);
      }
    }
  });
}

export function subscribeToDirectoryChanges(
  dirPath: string,
  callback: (changes: unknown) => void,
): () => void {
  // If the API isn't available, return no-op gracefully
  if (!window.electronAPI?.files?.watchDir) {
    return () => {};
  }

  ensureGlobalListener();

  const typedCallback = callback as ChangeCallback;

  let cbs = subscribers.get(dirPath);
  if (!cbs) {
    cbs = new Set();
    subscribers.set(dirPath, cbs);
    // Start watching this directory via IPC
    void window.electronAPI.files.watchDir(dirPath);
  }
  cbs.add(typedCallback);

  return () => {
    const set = subscribers.get(dirPath);
    if (!set) return;
    set.delete(typedCallback);
    if (set.size === 0) {
      subscribers.delete(dirPath);
      // Stop watching since no more subscribers for this directory
      if (window.electronAPI?.files?.unwatchDir) {
        void window.electronAPI.files.unwatchDir(dirPath);
      }
    }
  };
}
