/** File watcher for rules and skill files using chokidar. */

import chokidar from 'chokidar';
import path from 'path';

const DEBOUNCE_MS = 1000;

function buildWatchPaths(projectRoot: string): string[] {
  return [
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, 'AGENTS.md'),
    path.join(projectRoot, '.ouroboros', 'skills', '**', '*.md'),
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

export function startRulesWatcher(
  projectRoot: string,
  onChange: () => void,
): () => void {
  const watchPaths = buildWatchPaths(projectRoot);
  const debounced = createDebouncedCallback(onChange);

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    persistent: false,
  });

  watcher.on('add', debounced);
  watcher.on('change', debounced);
  watcher.on('unlink', debounced);

  return () => {
    watcher.close().catch(() => undefined);
  };
}
