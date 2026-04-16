/**
 * sessionTrash.test.ts — Unit tests for sessionTrash operations.
 *
 * Uses an in-memory TrashAdaptor so no filesystem is touched.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Session } from './session';
import { makeSession } from './session';
import type { TrashAdaptor } from './sessionTrash';
import {
  deleteFromTrash,
  listTrashFiles,
  restoreFromTrash,
  writeToTrash,
} from './sessionTrash';

// ─── In-memory adaptor factory ────────────────────────────────────────────────

function makeMemAdaptor(): TrashAdaptor & { store: Map<string, Session> } {
  const store = new Map<string, Session>();
  const trashDir = '/mock/session-trash';
  return {
    trashDir,
    store,
    readJson: async (filePath: string) => store.get(filePath) ?? null,
    writeJson: async (filePath: string, session: Session) => { store.set(filePath, session); },
    deleteFile: async (filePath: string) => { store.delete(filePath); },
    listFiles: async (dir: string) => { void dir; return [...store.keys()]; },
    ensureDir: async (dir: string) => { void dir; },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('writeToTrash', () => {
  it('writes the session JSON to the trash directory', async () => {
    const adaptor = makeMemAdaptor();
    const session = makeSession('/projects/alpha');
    await writeToTrash(session, adaptor);
    expect(adaptor.store.size).toBe(1);
    const [, stored] = [...adaptor.store.entries()][0];
    expect(stored.id).toBe(session.id);
  });

  it('stores under {trashDir}/{sessionId}.json path key', async () => {
    const adaptor = makeMemAdaptor();
    const session = makeSession('/projects/alpha');
    await writeToTrash(session, adaptor);
    const key = [...adaptor.store.keys()][0];
    expect(key).toContain(session.id);
    expect(key).toContain('session-trash');
  });
});

describe('restoreFromTrash', () => {
  let adaptor: ReturnType<typeof makeMemAdaptor>;
  let session: Session;

  beforeEach(async () => {
    adaptor = makeMemAdaptor();
    session = { ...makeSession('/projects/beta'), archivedAt: new Date().toISOString() };
    await writeToTrash(session, adaptor);
  });

  it('calls onRestore with the session without archivedAt', async () => {
    let restored: Session | null = null;
    const result = await restoreFromTrash(session.id, (s) => { restored = s; }, adaptor);
    expect(result).toBe(true);
    expect(restored).not.toBeNull();
    expect((restored as unknown as Session).id).toBe(session.id);
    expect((restored as unknown as Session).archivedAt).toBeUndefined();
  });

  it('deletes the trash file after restore', async () => {
    await restoreFromTrash(session.id, () => { /* noop */ }, adaptor);
    expect(adaptor.store.size).toBe(0);
  });

  it('returns false when no trash file exists for the sessionId', async () => {
    const result = await restoreFromTrash('no-such-id', () => { /* noop */ }, adaptor);
    expect(result).toBe(false);
  });
});

describe('deleteFromTrash', () => {
  it('removes the trash file for the given sessionId', async () => {
    const adaptor = makeMemAdaptor();
    const session = makeSession('/projects/gamma');
    await writeToTrash(session, adaptor);
    expect(adaptor.store.size).toBe(1);
    await deleteFromTrash(session.id, adaptor);
    expect(adaptor.store.size).toBe(0);
  });

  it('is a no-op when the file does not exist', async () => {
    const adaptor = makeMemAdaptor();
    await expect(deleteFromTrash('ghost-id', adaptor)).resolves.not.toThrow();
  });
});

describe('listTrashFiles', () => {
  it('returns empty array when trash is empty', async () => {
    const adaptor = makeMemAdaptor();
    const files = await listTrashFiles(adaptor);
    expect(files).toEqual([]);
  });

  it('returns one entry per written session', async () => {
    const adaptor = makeMemAdaptor();
    await writeToTrash(makeSession('/a'), adaptor);
    await writeToTrash(makeSession('/b'), adaptor);
    const files = await listTrashFiles(adaptor);
    expect(files).toHaveLength(2);
  });
});
