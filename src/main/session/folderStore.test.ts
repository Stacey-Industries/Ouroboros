import { describe, expect, it } from 'vitest';

import type { SessionFolder, FolderStoreAdaptor } from './folderStore';
import { openFolderStore } from './folderStore';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeAdaptor(initial: SessionFolder[] = []): FolderStoreAdaptor & { data: SessionFolder[] } {
  let stored: SessionFolder[] = [...initial];
  const proxy = {
    get data(): SessionFolder[] { return stored; },
    read: () => stored,
    // write receives a potentially-aliased array; snapshot it first
    write: (folders: SessionFolder[]) => { stored = [...folders]; },
  };
  return proxy;
}

function makeFolder(overrides: Partial<SessionFolder> = {}): SessionFolder {
  return {
    id: 'folder-1',
    name: 'My Folder',
    sessionIds: [],
    createdAt: 1000,
    order: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('folderStore', () => {
  it('listAll returns empty array when store is empty', () => {
    const store = openFolderStore(makeAdaptor());
    expect(store.listAll()).toEqual([]);
  });

  it('upsert inserts a new folder', () => {
    const store = openFolderStore(makeAdaptor());
    const folder = makeFolder();
    store.upsert(folder);
    expect(store.listAll()).toHaveLength(1);
    expect(store.listAll()[0]?.name).toBe('My Folder');
  });

  it('upsert updates an existing folder by id', () => {
    const folder = makeFolder({ name: 'Old' });
    const store = openFolderStore(makeAdaptor([folder]));
    store.upsert({ ...folder, name: 'New' });
    const all = store.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('New');
  });

  it('delete removes a folder by id', () => {
    const store = openFolderStore(makeAdaptor([makeFolder()]));
    store.delete('folder-1');
    expect(store.listAll()).toHaveLength(0);
  });

  it('addSession adds a session id to a folder', () => {
    const store = openFolderStore(makeAdaptor([makeFolder()]));
    store.addSession('folder-1', 'sess-abc');
    expect(store.listAll()[0]?.sessionIds).toContain('sess-abc');
  });

  it('addSession is idempotent — duplicate session ids are not added', () => {
    const store = openFolderStore(makeAdaptor([makeFolder({ sessionIds: ['sess-abc'] })]));
    store.addSession('folder-1', 'sess-abc');
    expect(store.listAll()[0]?.sessionIds).toHaveLength(1);
  });

  it('removeSession removes a session id from a folder', () => {
    const store = openFolderStore(makeAdaptor([makeFolder({ sessionIds: ['sess-abc'] })]));
    store.removeSession('folder-1', 'sess-abc');
    expect(store.listAll()[0]?.sessionIds).toHaveLength(0);
  });

  it('getFolderForSession returns the containing folder', () => {
    const folder = makeFolder({ sessionIds: ['sess-xyz'] });
    const store = openFolderStore(makeAdaptor([folder]));
    expect(store.getFolderForSession('sess-xyz')?.id).toBe('folder-1');
  });

  it('getFolderForSession returns null when session is in no folder', () => {
    const store = openFolderStore(makeAdaptor([makeFolder()]));
    expect(store.getFolderForSession('not-there')).toBeNull();
  });

  it('moveSessionBetweenFolders moves session from one folder to another', () => {
    const a = makeFolder({ id: 'a', sessionIds: ['sess-1'] });
    const b = makeFolder({ id: 'b', sessionIds: [] });
    const store = openFolderStore(makeAdaptor([a, b]));
    store.moveSessionBetweenFolders('a', 'b', 'sess-1');
    const all = store.listAll();
    const folderA = all.find((f) => f.id === 'a');
    const folderB = all.find((f) => f.id === 'b');
    expect(folderA?.sessionIds).not.toContain('sess-1');
    expect(folderB?.sessionIds).toContain('sess-1');
  });

  it('moveSessionBetweenFolders with null fromId just adds to target', () => {
    const b = makeFolder({ id: 'b', sessionIds: [] });
    const store = openFolderStore(makeAdaptor([b]));
    store.moveSessionBetweenFolders(null, 'b', 'sess-new');
    expect(store.listAll()[0]?.sessionIds).toContain('sess-new');
  });

  it('moveSessionBetweenFolders with null toId just removes from source', () => {
    const a = makeFolder({ id: 'a', sessionIds: ['sess-1'] });
    const store = openFolderStore(makeAdaptor([a]));
    store.moveSessionBetweenFolders('a', null, 'sess-1');
    expect(store.listAll()[0]?.sessionIds).toHaveLength(0);
  });
});
