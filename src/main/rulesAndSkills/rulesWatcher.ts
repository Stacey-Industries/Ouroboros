/** File watcher for rules, skills, and Claude Code config files using chokidar. */

import chokidar from 'chokidar';
import os from 'os';
import path from 'path';

const DEBOUNCE_MS = 1000;
const CLAUDE_DIR = '.claude';

function buildProjectPaths(projectRoot: string): string[] {
  return [
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, 'AGENTS.md'),
    path.join(projectRoot, CLAUDE_DIR, 'commands', '*.md'),
    path.join(projectRoot, CLAUDE_DIR, 'rules', '*.md'),
  ];
}

function buildGlobalPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, CLAUDE_DIR, 'commands', '*.md'),
    path.join(home, CLAUDE_DIR, 'rules', '*.md'),
  ];
}

function buildWatchPaths(projectRoot: string): string[] {
  return [...buildProjectPaths(projectRoot), ...buildGlobalPaths()];
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
