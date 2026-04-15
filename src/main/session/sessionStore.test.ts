/**
 * sessionStore.test.ts — Unit tests for SessionStore CRUD operations.
 *
 * Uses openSessionStore() with an in-memory adaptor — no electron-store needed.
 */

import { describe, expect, it } from 'vitest';

import { makeSession } from './session';
import { openSessionStore } from './sessionStore';

// ─── In-memory adaptor factory ────────────────────────────────────────────────

function makeAdaptor(initial: ReturnType<typeof makeSession>[] = []) {
  let data = [...initial];
  return {
    read: () => [...data],
    write: (sessions: ReturnType<typeof makeSession>[]) => { data = [...sessions]; },
    snapshot: () => [...data],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('upsert + getById', () => {
  it('inserts a new session and retrieves it by id', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/projects/foo');
    store.upsert(s);
    expect(store.getById(s.id)).toEqual(s);
  });

  it('updates an existing session on second upsert', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/projects/foo');
    store.upsert(s);
    const updated = { ...s, lastUsedAt: new Date().toISOString(), tags: ['updated'] };
    store.upsert(updated);
    const result = store.getById(s.id);
    expect(result?.tags).toEqual(['updated']);
    // only one entry, not two
    expect(store.listAll()).toHaveLength(1);
  });

  it('returns undefined for an unknown id', () => {
    const store = openSessionStore(makeAdaptor());
    expect(store.getById('no-such-id')).toBeUndefined();
  });
});

describe('listAll', () => {
  it('returns all sessions including archived ones', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const a = makeSession('/a');
    const b = makeSession('/b');
    store.upsert(a);
    store.upsert(b);
    store.archive(a.id);
    expect(store.listAll()).toHaveLength(2);
  });

  it('returns empty array when store is empty', () => {
    const store = openSessionStore(makeAdaptor());
    expect(store.listAll()).toEqual([]);
  });
});

describe('archive', () => {
  it('sets archivedAt on the target session', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/projects/foo');
    store.upsert(s);
    store.archive(s.id);
    const archived = store.getById(s.id);
    expect(archived?.archivedAt).toBeDefined();
    expect(typeof archived?.archivedAt).toBe('string');
  });

  it('archivedAt is a valid ISO timestamp', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/projects/foo');
    store.upsert(s);
    store.archive(s.id);
    const archived = store.getById(s.id);
    expect(() => new Date(archived!.archivedAt!).toISOString()).not.toThrow();
  });

  it('does not mutate other sessions', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const a = makeSession('/a');
    const b = makeSession('/b');
    store.upsert(a);
    store.upsert(b);
    store.archive(a.id);
    expect(store.getById(b.id)?.archivedAt).toBeUndefined();
  });

  it('is a no-op for an unknown id (does not throw)', () => {
    const store = openSessionStore(makeAdaptor());
    expect(() => store.archive('ghost-id')).not.toThrow();
  });
});

describe('listActive', () => {
  it('excludes archived sessions', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const a = makeSession('/a');
    const b = makeSession('/b');
    store.upsert(a);
    store.upsert(b);
    store.archive(a.id);
    const active = store.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b.id);
  });

  it('returns all sessions when none are archived', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    store.upsert(makeSession('/a'));
    store.upsert(makeSession('/b'));
    expect(store.listActive()).toHaveLength(2);
  });

  it('returns empty array when all are archived', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/a');
    store.upsert(s);
    store.archive(s.id);
    expect(store.listActive()).toHaveLength(0);
  });
});

describe('listByProjectRoot', () => {
  it('returns only sessions with the matching projectRoot', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const a = makeSession('/root-a');
    const b = makeSession('/root-b');
    const c = makeSession('/root-a');
    store.upsert(a);
    store.upsert(b);
    store.upsert(c);
    const result = store.listByProjectRoot('/root-a');
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.projectRoot === '/root-a')).toBe(true);
  });

  it('returns empty array when no sessions match', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    store.upsert(makeSession('/other'));
    expect(store.listByProjectRoot('/nowhere')).toHaveLength(0);
  });
});

describe('delete', () => {
  it('removes the session from the store', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/projects/foo');
    store.upsert(s);
    store.delete(s.id);
    expect(store.getById(s.id)).toBeUndefined();
    expect(store.listAll()).toHaveLength(0);
  });

  it('does not remove other sessions', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const a = makeSession('/a');
    const b = makeSession('/b');
    store.upsert(a);
    store.upsert(b);
    store.delete(a.id);
    expect(store.getById(b.id)).toBeDefined();
    expect(store.listAll()).toHaveLength(1);
  });

  it('is a no-op for an unknown id (does not throw)', () => {
    const store = openSessionStore(makeAdaptor());
    expect(() => store.delete('ghost-id')).not.toThrow();
  });
});

describe('round-trip persistence', () => {
  it('written data is reflected in subsequent reads', () => {
    const adaptor = makeAdaptor();
    const store = openSessionStore(adaptor);
    const s = makeSession('/projects/foo');
    store.upsert(s);
    // Open a second store instance over the same adaptor to verify persistence
    const store2 = openSessionStore(adaptor);
    expect(store2.getById(s.id)).toEqual(s);
  });
});
