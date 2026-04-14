/** File watcher for rules, skills, and Claude Code config files. */

import fs from 'fs';
import os from 'os';
import path from 'path';

import log from '../logger';
import type { WatchSubscription } from '../watchers';
import { watchRecursive } from '../watchers';

const DEBOUNCE_MS = 1000;
const CLAUDE_DIR = '.claude';

/** Direct file paths (no glob needed — exact files). */
function buildDirectFilePaths(projectRoot: string): string[] {
  return [
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, 'AGENTS.md'),
  ];
}

/** Directories containing .md rules/commands (watched recursively). */
function buildMdDirectories(projectRoot: string): string[] {
  const home = os.homedir();
  return [
    path.join(projectRoot, CLAUDE_DIR, 'commands'),
    path.join(projectRoot, CLAUDE_DIR, 'rules'),
    path.join(home, CLAUDE_DIR, 'commands'),
    path.join(home, CLAUDE_DIR, 'rules'),
  ];
}

function createDebouncedCallback(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  };
}

/** Subscribe to one directory with watchRecursive; skip silently if dir is missing. */
async function subscribeMdDir(
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
      log.info(`[rulesWatcher] skipping missing dir: ${dir}`);
      return null;
    }
    log.warn(`[rulesWatcher] watchRecursive failed for ${dir}:`, err);
    return null;
  }
}

/** Watch a single file with fs.watch; skip silently if file does not exist. */
function watchSingleFile(
  filePath: string,
  debounced: () => void,
): fs.FSWatcher | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated projectRoot
    return fs.watch(filePath, debounced);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    log.warn(`[rulesWatcher] fs.watch failed for ${filePath}:`, err);
    return null;
  }
}

export function startRulesWatcher(
  projectRoot: string,
  onChange: () => void,
): () => void {
  const debounced = createDebouncedCallback(onChange);
  const mdDirs = buildMdDirectories(projectRoot);
  const directFiles = buildDirectFilePaths(projectRoot);

  const subscriptions: Array<WatchSubscription | null> = [];
  const fsWatchers: Array<fs.FSWatcher | null> = [];

  // Start all directory subscriptions in parallel, but track the pending promise
  // so the cleanup function can await them properly.
  const subscribePromise = Promise.all(
    mdDirs.map((dir) => subscribeMdDir(dir, debounced)),
  ).then((subs) => {
    subscriptions.push(...subs);
  });

  // Set up single-file fs.watch handles (synchronous, may return null for ENOENT)
  for (const filePath of directFiles) {
    fsWatchers.push(watchSingleFile(filePath, debounced));
  }

  return () => {
    // Await subscription setup before closing, then close all non-null subscriptions.
    void subscribePromise.then(async () => {
      await Promise.all(
        subscriptions.map((sub) => (sub ? sub.close() : Promise.resolve())),
      );
    });

    for (const w of fsWatchers) {
      if (w) {
        try {
          w.close();
        } catch {
          // ignore errors during cleanup
        }
      }
    }
  };
}
