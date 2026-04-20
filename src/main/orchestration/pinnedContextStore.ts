/**
 * pinnedContextStore.ts — Session-scoped pinned context management (Wave 25).
 *
 * Thin wrapper over sessionStore. All mutations persist via sessionStore.upsert.
 *
 * Cap policy:
 *   - Max 10 active (non-dismissed) pins per session.
 *   - add(): if cap hit and all pins are active, reject (return null).
 *   - add(): if cap hit but dismissed pins exist, replace the oldest dismissed.
 *   - Dismissed items stay in the array for within-session undo.
 */

import { randomUUID } from 'node:crypto';

import type { PinnedContextItem } from '@shared/types/pinnedContext';

import log from '../logger';
import type { Session } from '../session/session';
import { getSessionStore, type SessionStore } from '../session/sessionStore';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_ACTIVE_PINS = 10;

// ─── Public interface ─────────────────────────────────────────────────────────

export interface PinnedContextStore {
  /**
   * Add a new pin. Generates id + addedAt. Returns the created item, or null
   * if the cap is hit and no dismissed items are available to replace.
   */
  add(
    sessionId: string,
    item: Omit<PinnedContextItem, 'id' | 'addedAt'>,
  ): PinnedContextItem | null;

  /** Hard-remove a pin by id (cannot be undone within the session). */
  remove(sessionId: string, itemId: string): void;

  /** Soft-hide a pin (sets dismissed: true). Item stays in array. */
  dismiss(sessionId: string, itemId: string): void;

  /** List pins for a session. Excludes dismissed by default. */
  list(sessionId: string, options?: { includeDismissed?: boolean }): PinnedContextItem[];
}

// ─── Dependency injection (for testability) ───────────────────────────────────

export interface PinnedContextStoreDeps {
  getStore(): SessionStore | null;
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function getSession(deps: PinnedContextStoreDeps, sessionId: string): Session | null {
  const store = deps.getStore();
  if (!store) { log.warn('[pinnedContextStore] sessionStore not initialised'); return null; }
  const session = store.getById(sessionId);
  if (!session) { log.warn('[pinnedContextStore] session not found:', sessionId); return null; }
  return session;
}

function getPins(session: Session): PinnedContextItem[] {
  return Array.isArray(session.pinnedContext) ? session.pinnedContext : [];
}

function countActive(pins: PinnedContextItem[]): number {
  return pins.filter((p) => !p.dismissed).length;
}

function oldestDismissedIndex(pins: PinnedContextItem[]): number {
  let idx = -1;
  let oldest = Infinity;
  for (let i = 0; i < pins.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const pin = pins[i];
    if (pin.dismissed && pin.addedAt < oldest) { oldest = pin.addedAt; idx = i; }
  }
  return idx;
}

function buildNewPins(
  pins: PinnedContextItem[],
  newItem: PinnedContextItem,
  activeCount: number,
  sessionId: string,
): PinnedContextItem[] | null {
  if (activeCount < MAX_ACTIVE_PINS) return [...pins, newItem];
  const replaceIdx = oldestDismissedIndex(pins);
  if (replaceIdx < 0) {
    log.warn('[pinnedContextStore] add: cap hit, no dismissed slots available', sessionId);
    return null;
  }
  const next = [...pins];
  next.splice(replaceIdx, 1, newItem);
  return next;
}

// ─── Operation implementations ────────────────────────────────────────────────

function applyAdd(
  deps: PinnedContextStoreDeps,
  sessionId: string,
  item: Omit<PinnedContextItem, 'id' | 'addedAt'>,
): PinnedContextItem | null {
  const session = getSession(deps, sessionId);
  if (!session) return null;
  const pins = getPins(session);
  const newItem: PinnedContextItem = { ...item, id: randomUUID(), addedAt: Date.now() };
  const newPins = buildNewPins(pins, newItem, countActive(pins), sessionId);
  if (!newPins) return null;
  deps.getStore()!.upsert({ ...session, pinnedContext: newPins });
  return newItem;
}

function applyRemove(deps: PinnedContextStoreDeps, sessionId: string, itemId: string): void {
  const session = getSession(deps, sessionId);
  if (!session) return;
  const pins = getPins(session);
  const filtered = pins.filter((p) => p.id !== itemId);
  if (filtered.length === pins.length) {
    log.warn('[pinnedContextStore] remove: item not found', itemId);
    return;
  }
  deps.getStore()!.upsert({ ...session, pinnedContext: filtered });
}

function applyDismiss(deps: PinnedContextStoreDeps, sessionId: string, itemId: string): void {
  const session = getSession(deps, sessionId);
  if (!session) return;
  const pins = getPins(session);
  const idx = pins.findIndex((p) => p.id === itemId);
  if (idx < 0) { log.warn('[pinnedContextStore] dismiss: item not found', itemId); return; }
  const updated = pins.map((p, i) => (i === idx ? { ...p, dismissed: true } : p));
  deps.getStore()!.upsert({ ...session, pinnedContext: updated });
}

function applyList(
  deps: PinnedContextStoreDeps,
  sessionId: string,
  options: { includeDismissed?: boolean } = {},
): PinnedContextItem[] {
  const session = getSession(deps, sessionId);
  if (!session) return [];
  const pins = getPins(session);
  return options.includeDismissed ? pins : pins.filter((p) => !p.dismissed);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildPinnedContextStore(deps: PinnedContextStoreDeps): PinnedContextStore {
  return {
    add: (sessionId, item) => applyAdd(deps, sessionId, item),
    remove: (sessionId, itemId) => applyRemove(deps, sessionId, itemId),
    dismiss: (sessionId, itemId) => applyDismiss(deps, sessionId, itemId),
    list: (sessionId, options) => applyList(deps, sessionId, options),
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: PinnedContextStore | null = null;

export function initPinnedContextStore(): void {
  if (singleton) return;
  singleton = buildPinnedContextStore({ getStore: getSessionStore });
  log.info('[pinnedContextStore] initialised');
}

export function getPinnedContextStore(): PinnedContextStore | null {
  return singleton;
}

export function closePinnedContextStore(): void {
  singleton = null;
}
