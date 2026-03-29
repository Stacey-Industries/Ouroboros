/** File watcher for rules, skills, and Claude Code config files using chokidar. */

import chokidar from 'chokidar';
import os from 'os';
import path from 'path';

const DEBOUNCE_MS = 1000;
const CLAUDE_DIR = '.claude';

/** Direct file paths (no glob needed — exact files). */
function buildDirectFilePaths(projectRoot: string): string[] {
  return [
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, 'AGENTS.md'),
  ];
}

/** Directories containing .md rules/commands (watched with ignored filter). */
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

export function startRulesWatcher(
  projectRoot: string,
  onChange: () => void,
): () => void {
  const directFiles = buildDirectFilePaths(projectRoot);
  const mdDirs = buildMdDirectories(projectRoot);
  const debounced = createDebouncedCallback(onChange);

  const watcher = chokidar.watch([...directFiles, ...mdDirs], {
    ignoreInitial: true,
    persistent: false,
    ignored: (filePath: string, stats?: { isFile(): boolean }) =>
      stats?.isFile() === true && !filePath.endsWith('.md'),
  });

  watcher.on('add', debounced);
  watcher.on('change', debounced);
  watcher.on('unlink', debounced);

  return () => {
    watcher.close().catch(() => undefined);
  };
}
