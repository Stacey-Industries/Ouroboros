/**
 * ipc-handlers/memory.ts — IPC handlers for project memory read access.
 *
 * Channels:
 *   memory:list  — list all MemoryEntry records for the active project root
 *   memory:read  — read the content of a single memory entry by id
 *
 * The watcher is started once per IPC registration; it auto-broadcasts
 * 'memory:changed' to all renderer webContents when the memory dir changes.
 */

import { ipcMain } from 'electron';

import { listMemoryEntries, readMemoryEntry } from '../memory/memoryReader';
import { startMemoryWatcher } from '../memory/memoryWatcher';

type FailResult = { success: false; error: string };

function fail(error: unknown): FailResult {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

type ListArgs = { projectRoot?: string };
type ReadArgs = { projectRoot?: string; id: string };

function registerMemoryList(channels: string[]): void {
  ipcMain.handle('memory:list', async (_event, args: ListArgs = {}) => {
    const cwd = args.projectRoot ?? process.cwd();
    try {
      const entries = await listMemoryEntries(cwd);
      return { success: true, entries };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('memory:list');
}

function registerMemoryRead(channels: string[]): void {
  ipcMain.handle('memory:read', async (_event, args: ReadArgs) => {
    const cwd = args.projectRoot ?? process.cwd();
    try {
      const result = await readMemoryEntry(cwd, args.id);
      if (!result) return { success: false, error: 'not found' };
      return { success: true, content: result.content };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('memory:read');
}

let stopWatcher: (() => void) | null = null;

function activateWatcher(cwd: string): void {
  if (stopWatcher) stopWatcher();
  stopWatcher = startMemoryWatcher(cwd);
}

export function cleanupMemoryHandlers(): void {
  if (stopWatcher) {
    stopWatcher();
    stopWatcher = null;
  }
}

/**
 * Register memory IPC handlers. `initialCwd` is the project root used to
 * start the initial watcher (defaults to process.cwd()). The renderer can
 * call memory:list with a different projectRoot at any time.
 */
export function registerMemoryHandlers(initialCwd?: string): string[] {
  const channels: string[] = [];
  registerMemoryList(channels);
  registerMemoryRead(channels);
  activateWatcher(initialCwd ?? process.cwd());
  return channels;
}
