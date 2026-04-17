/**
 * pinnedContextStore.test.ts — Unit tests for the pinned context store (Wave 25).
 *
 * Uses an in-memory StoreAdaptor so no electron-store or filesystem is touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { PinnedContextItem } from '@shared/types/pinnedContext';

import type { Session } from '../session/session';
import { makeSession } from '../session/session';
import type { SessionStore } from '../session/sessionStore';
import { openSessionStore } from '../session/sessionStore';
import {
  buildPinnedContextStore,
  MAX_ACTIVE_PINS,
} from './pinnedContextStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInMemoryStore(): SessionStore {
  const sessions: Session[] = [];
  return openSessionStore({
    read: () => sessions.slice(),
    write: (updated) => { sessions.length = 0; sessions.push(...updated); },
  });
}

function makeItem(
  overrides: Partial<Omit<PinnedContextItem, 'id' | 'addedAt'>> = {},
): Omit<PinnedContextItem, 'id' | 'addedAt'> {
  return {
    type: 'user-file',
    source: '/src/main/foo.ts',
    title: 'foo.ts',
    content: 'export const foo = 1;',
    tokens: 10,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pinnedContextStore', () => {
  let store: SessionStore;
  let session: Session;

  beforeEach(() => {
    store = makeInMemoryStore();
    session = makeSession('/projects/test');
    store.upsert(session);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('creates a new pin with generated id and addedAt', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const item = ctx.add(session.id, makeItem());
      expect(item).not.toBeNull();
      expect(item!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item!.addedAt).toBeGreaterThan(0);
      expect(item!.title).toBe('foo.ts');
    });

    it('persists the pin to the session via upsert', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      ctx.add(session.id, makeItem());
      const updated = store.getById(session.id);
      expect(updated?.pinnedContext).toHaveLength(1);
    });

    it('returns null for an unknown sessionId', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const result = ctx.add('nonexistent', makeItem());
      expect(result).toBeNull();
    });

    it('returns null when store is null', () => {
      const ctx = buildPinnedContextStore({ getStore: () => null });
      const result = ctx.add(session.id, makeItem());
      expect(result).toBeNull();
    });

    it('rejects when active-pin cap is hit and no dismissed slots exist', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      for (let i = 0; i < MAX_ACTIVE_PINS; i++) {
        expect(ctx.add(session.id, makeItem({ title: `file-${i}.ts` }))).not.toBeNull();
      }
      const overflow = ctx.add(session.id, makeItem({ title: 'overflow.ts' }));
      expect(overflow).toBeNull();
    });

    it('replaces oldest dismissed item when active cap hit and dismissed slots exist', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const items: PinnedContextItem[] = [];
      for (let i = 0; i < MAX_ACTIVE_PINS; i++) {
        const added = ctx.add(session.id, makeItem({ title: `file-${i}.ts` }));
        expect(added).not.toBeNull();
        items.push(added!);
      }
      // Cap is now full (10 active). Dismiss one — active drops to 9 but array stays 10.
      ctx.dismiss(session.id, items[0].id);
      // Add one more — active=9 < 10, so it appends (array becomes 11, active=10).
      const fill = ctx.add(session.id, makeItem({ title: 'fill.ts' }));
      expect(fill).not.toBeNull();
      // Cap full again (10 active). Next add must replace the dismissed slot.
      const replacement = ctx.add(session.id, makeItem({ title: 'replacement.ts' }));
      expect(replacement).not.toBeNull();
      expect(replacement!.title).toBe('replacement.ts');

      const pins = store.getById(session.id)!.pinnedContext;
      // dismissed slot replaced → still 11 total, dismissed item gone
      expect(pins).toHaveLength(11);
      expect(pins.find((p) => p.id === items[0].id)).toBeUndefined();
      expect(pins.find((p) => p.title === 'replacement.ts')).toBeTruthy();
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('hard-removes a pin by id', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const item = ctx.add(session.id, makeItem())!;
      ctx.remove(session.id, item.id);
      const pins = store.getById(session.id)!.pinnedContext;
      expect(pins).toHaveLength(0);
    });

    it('is a no-op for an unknown itemId (warns only)', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      ctx.add(session.id, makeItem());
      expect(() => ctx.remove(session.id, 'not-real')).not.toThrow();
      expect(store.getById(session.id)!.pinnedContext).toHaveLength(1);
    });
  });

  // ── dismiss ───────────────────────────────────────────────────────────────

  describe('dismiss()', () => {
    it('sets dismissed: true on the target item', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const item = ctx.add(session.id, makeItem())!;
      ctx.dismiss(session.id, item.id);
      const pins = store.getById(session.id)!.pinnedContext;
      expect(pins[0].dismissed).toBe(true);
    });

    it('keeps the item in the array after dismissal', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const item = ctx.add(session.id, makeItem())!;
      ctx.dismiss(session.id, item.id);
      expect(store.getById(session.id)!.pinnedContext).toHaveLength(1);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns only non-dismissed pins by default', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const a = ctx.add(session.id, makeItem({ title: 'a.ts' }))!;
      ctx.add(session.id, makeItem({ title: 'b.ts' }));
      ctx.dismiss(session.id, a.id);

      const visible = ctx.list(session.id);
      expect(visible).toHaveLength(1);
      expect(visible[0].title).toBe('b.ts');
    });

    it('includes dismissed pins when includeDismissed: true', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      const a = ctx.add(session.id, makeItem({ title: 'a.ts' }))!;
      ctx.add(session.id, makeItem({ title: 'b.ts' }));
      ctx.dismiss(session.id, a.id);

      const all = ctx.list(session.id, { includeDismissed: true });
      expect(all).toHaveLength(2);
    });

    it('returns [] for unknown session', () => {
      const ctx = buildPinnedContextStore({ getStore: () => store });
      expect(ctx.list('nonexistent')).toEqual([]);
    });

    it('returns [] when store is null', () => {
      const ctx = buildPinnedContextStore({ getStore: () => null });
      expect(ctx.list(session.id)).toEqual([]);
    });
  });

  // ── old session migration ─────────────────────────────────────────────────

  describe('old session migration (missing pinnedContext field)', () => {
    it('treats absent pinnedContext as empty array', () => {
      const legacy = { ...makeSession('/legacy'), pinnedContext: undefined } as unknown as Session;
      store.upsert(legacy);
      const ctx = buildPinnedContextStore({ getStore: () => store });
      expect(ctx.list(legacy.id)).toEqual([]);
      // Can add to it without error
      const item = ctx.add(legacy.id, makeItem());
      expect(item).not.toBeNull();
    });
  });
});
