/**
 * workspaceReadList.ts — Per-project "always-pinned" file list (Wave 25 Phase E).
 *
 * Stores a map of { [projectRoot: string]: string[] } in config under
 * `workspaceReadLists`. Entries auto-populate `pinnedContext` when a session
 * opens in the matching project root.
 */

import path from 'node:path';

import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';
import { getPinnedContextStore } from './pinnedContextStore';

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Return the current read-list for a project root (never null). */
export function getReadList(projectRoot: string): string[] {
  const map = getConfigValue('workspaceReadLists') ?? {};
  // eslint-disable-next-line security/detect-object-injection -- projectRoot is a validated config path
  return Array.isArray(map[projectRoot]) ? [...map[projectRoot]] : [];
}

/** Add a file to the read-list for a project root. Returns the new list. */
export function addToReadList(projectRoot: string, filePath: string): string[] {
  const map = { ...(getConfigValue('workspaceReadLists') ?? {}) };
  // eslint-disable-next-line security/detect-object-injection -- projectRoot is a validated config path
  const current = Array.isArray(map[projectRoot]) ? map[projectRoot] : [];
  if (current.includes(filePath)) return [...current];
  const next = [...current, filePath];
  // eslint-disable-next-line security/detect-object-injection -- projectRoot is a validated config path
  map[projectRoot] = next;
  setConfigValue('workspaceReadLists', map);
  return next;
}

/** Remove a file from the read-list for a project root. Returns the new list. */
export function removeFromReadList(projectRoot: string, filePath: string): string[] {
  const map = { ...(getConfigValue('workspaceReadLists') ?? {}) };
  // eslint-disable-next-line security/detect-object-injection -- projectRoot is a validated config path
  const current = Array.isArray(map[projectRoot]) ? map[projectRoot] : [];
  const next = current.filter((p) => p !== filePath);
  // eslint-disable-next-line security/detect-object-injection -- projectRoot is a validated config path
  map[projectRoot] = next;
  setConfigValue('workspaceReadLists', map);
  return next;
}

/**
 * For each file in the read-list, add a stub pin to the session via
 * pinnedContextStore. Skips files already present in the session's pins.
 */
export function applyToSession(sessionId: string, projectRoot: string): void {
  const store = getPinnedContextStore();
  if (!store) {
    log.warn('[workspaceReadList] pinnedContextStore not initialised; skipping applyToSession');
    return;
  }
  const files = getReadList(projectRoot);
  if (files.length === 0) return;

  const existing = store.list(sessionId, { includeDismissed: true });
  const existingSources = new Set(existing.map((p) => p.source));

  for (const filePath of files) {
    if (existingSources.has(filePath)) continue;
    store.add(sessionId, {
      type: 'user-file',
      source: filePath,
      title: path.basename(filePath),
      content: '(not yet loaded)',
      tokens: 0,
    });
  }

  log.info('[workspaceReadList] applyToSession', { sessionId, projectRoot, count: files.length });
}
