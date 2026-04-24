/**
 * windowManagerSessions.ts — Window session persistence helpers.
 *
 * Extracted from windowManager.ts to keep that file under the ESLint max-lines
 * limit. Contains persist/restore functions for window bounds across restarts.
 */

import { BrowserWindow } from 'electron';

import { getConfigValue, setConfigValue, type WindowSession } from './config';
import type { Session } from './session';
import {
  applyPersistedBounds,
  captureWindowBounds,
  mergeBoundsIntoSessions,
  sessionsDataToWindowSessions,
} from './windowManagerHelpers';

// ── Internal window state accessor (injected by windowManager.ts) ─────────────

type WindowValuesGetter = () => Iterable<{ win: BrowserWindow; projectRoot: string | null }>;
type WindowCreator = (projectRoot?: string) => BrowserWindow;
type WindowSetter = (id: number, key: 'projectRoots' | 'projectRoot', val: unknown) => void;

let _getAllValues: WindowValuesGetter = () => [];
let _createWindow: WindowCreator = () => { throw new Error('windowManager not wired'); };
let _setManaged: WindowSetter = () => undefined;

export function wireSessionHelpers(
  getAllValues: WindowValuesGetter,
  createWindow: WindowCreator,
  setManaged: WindowSetter,
): void {
  _getAllValues = getAllValues;
  _createWindow = createWindow;
  _setManaged = setManaged;
}

// ── Session persistence ───────────────────────────────────────────────────────

function buildLiveBoundsByRoot(): Map<string, Session['bounds']> {
  const map = new Map<string, Session['bounds']>();
  for (const managed of _getAllValues()) {
    if (managed.win.isDestroyed()) continue;
    if (!managed.projectRoot) continue;
    map.set(managed.projectRoot, captureWindowBounds(managed.win));
  }
  return map;
}

/**
 * Persist current window bounds into sessionsData (canonical store).
 * No longer writes to the legacy windowSessions key (Wave 40 Phase D).
 */
export function persistWindowSessions(): void {
  try {
    const existing = (getConfigValue('sessionsData') as Session[] | undefined) ?? [];
    if (!Array.isArray(existing)) return;
    const byRoot = buildLiveBoundsByRoot();
    if (byRoot.size === 0) return;
    setConfigValue('sessionsData', mergeBoundsIntoSessions(existing, byRoot) as never);
  } catch {
    /* best-effort */
  }
}

function restoreOneSession(session: WindowSession): BrowserWindow | null {
  if (!session.projectRoots?.length) return null;
  const win = _createWindow(session.projectRoots[0]);
  _setManaged(win.id, 'projectRoots', session.projectRoots);
  _setManaged(win.id, 'projectRoot', session.projectRoots[0] ?? null);
  applyPersistedBounds(win, session.bounds);
  return win;
}

/**
 * Restore windows on startup.
 * Reads from sessionsData (canonical store) first; falls back to the legacy
 * windowSessions key for one-release transition (Wave 40 Phase D).
 */
export function restoreWindowSessions(): BrowserWindow[] {
  const sessionsData = (getConfigValue('sessionsData') as Session[] | undefined) ?? [];
  const canonical = Array.isArray(sessionsData) ? sessionsDataToWindowSessions(sessionsData) : [];
  const source =
    canonical.length > 0
      ? canonical
      : ((getConfigValue('windowSessions') as WindowSession[] | undefined) ?? []);
  if (!Array.isArray(source) || source.length === 0) return [];
  return source.map(restoreOneSession).filter((w): w is BrowserWindow => w !== null);
}
