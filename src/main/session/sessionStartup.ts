/**
 * sessionStartup.ts — Startup wrapper for the session subsystem.
 *
 * Extracted so main.ts can initialise sessions with a single call without
 * inflating main.ts past its 300-line ESLint cap.
 *
 * GC strategy (single interval handles both passes):
 *   - 7-day archive GC  (runSessionGc)    — purges archived sessions
 *   - 30-day delete GC  (runSoftDeleteGc) — purges soft-deleted sessions + threads
 *
 * One setInterval fires both; interval = SEVEN_DAYS_MS (the shorter window).
 */

import type { AppConfig } from '../config';
import { getConfigValue } from '../config';
import log from '../logger';
import {
  closePinnedContextStore,
  initPinnedContextStore,
} from '../orchestration/pinnedContextStore';
import {
  closeProfileStore,
  initProfileStore,
} from '../profiles/profileStore';
import { closeFolderStore, initFolderStore } from './folderStore';
import { loadQueue } from './sessionDispatchQueue';
import { startDispatchRunner, stopDispatchRunner } from './sessionDispatchRunner';
import { runSessionGc, SEVEN_DAYS_MS } from './sessionGc';
import { migrateWindowSessionsToSessions } from './sessionMigration';
import { closeSessionStore, getSessionStore, initSessionStore } from './sessionStore';
import { runSoftDeleteGc } from './softDeleteGc';
import { getWorktreeManager } from './worktreeManager';

export interface ConfigAccess {
  get: <K extends keyof AppConfig>(key: K) => AppConfig[K];
  set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

let gcInterval: ReturnType<typeof setInterval> | null = null;

function getThreadStore(): import('../agentChat/threadStore').AgentChatThreadStore | null {
  try {
    // Lazy-require avoids pulling agentChatThreadStore at module load time — it calls
    // electron.app.getPath('userData') at the import site, unavailable in tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('../agentChat/threadStore') as typeof import('../agentChat/threadStore');
    return m.agentChatThreadStore ?? null;
  } catch {
    return null;
  }
}

function runAllGc(): void {
  const now = Date.now();
  void runSessionGc(now);
  void runSoftDeleteGc(now, getSessionStore(), getThreadStore());
}

function logOrphans(
  root: string,
  worktrees: import('./worktreeManager').WorktreeRecord[],
  activeWorktreePaths: Set<string>,
): void {
  for (const wt of worktrees) {
    if (!wt.isMain && !activeWorktreePaths.has(wt.path)) {
      log.warn('[worktree] orphaned path detected', { path: wt.path, projectRoot: root });
    }
  }
}

/**
 * Scan for orphaned git worktrees (worktrees on disk with no matching session).
 * Logs a warning for each orphan — does NOT delete automatically.
 */
export async function scanOrphanWorktrees(): Promise<void> {
  const store = getSessionStore();
  if (!store) return;

  const sessions = store.listAll();
  const activeWorktreePaths = new Set(
    sessions.filter((s) => s.worktree && s.worktreePath).map((s) => s.worktreePath as string),
  );
  const roots = [...new Set(sessions.filter((s) => s.worktree).map((s) => s.projectRoot))];

  for (const root of roots) {
    try {
      const worktrees = await getWorktreeManager().list(root);
      logOrphans(root, worktrees, activeWorktreePaths);
    } catch (err) {
      log.warn('[worktree] orphan scan failed for root', { root, err });
    }
  }
}

/**
 * Initialise the session store and migrate windowSessions → sessionsData.
 * Called from main.ts after telemetry is up and before window creation.
 */
export async function initSessionServices(config: ConfigAccess): Promise<void> {
  initSessionStore();
  initPinnedContextStore();
  initProfileStore();
  initFolderStore();
  await migrateWindowSessionsToSessions(config.get, config.set);
  // Run GC once at startup, then weekly (interval covers both 7-day and 30-day passes).
  runAllGc();
  gcInterval = setInterval(runAllGc, SEVEN_DAYS_MS);
  // Startup orphan scan — logs only, no auto-delete.
  void scanOrphanWorktrees();
  loadQueue();
  if (getConfigValue('sessionDispatch')?.enabled) startDispatchRunner();
}

/** Mirror of closeSessionStore for use in the will-quit cleanup chain. */
export function closeSessionServices(): void {
  stopDispatchRunner();
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
  closeSessionStore();
  closePinnedContextStore();
  closeProfileStore();
  closeFolderStore();
}
