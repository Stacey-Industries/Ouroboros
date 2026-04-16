/**
 * preloadSupplementalFolderApis.test.ts
 *
 * Verifies each folderCrudApi method invokes the correct IPC channel
 * with the expected argument shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock (hoisted so vi.mock factory can reference them) ────────────

const { mockInvoke, mockOn, mockRemoveListener } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockOn: vi.fn(),
  mockRemoveListener: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import { folderCrudApi } from './preloadSupplementalFolderApis';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('folderCrudApi', () => {
  it('list() invokes folderCrud:list', async () => {
    await folderCrudApi.list();
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:list');
  });

  it('create() invokes folderCrud:create with name', async () => {
    await folderCrudApi.create('Sprint 1');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:create', { name: 'Sprint 1' });
  });

  it('rename() invokes folderCrud:rename with id and name', async () => {
    await folderCrudApi.rename('f-1', 'Renamed');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:rename', { id: 'f-1', name: 'Renamed' });
  });

  it('delete() invokes folderCrud:delete with id', async () => {
    await folderCrudApi.delete('f-2');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:delete', { id: 'f-2' });
  });

  it('addSession() invokes folderCrud:addSession with folderId and sessionId', async () => {
    await folderCrudApi.addSession('f-1', 's-99');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:addSession', {
      folderId: 'f-1',
      sessionId: 's-99',
    });
  });

  it('removeSession() invokes folderCrud:removeSession with folderId and sessionId', async () => {
    await folderCrudApi.removeSession('f-1', 's-99');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:removeSession', {
      folderId: 'f-1',
      sessionId: 's-99',
    });
  });

  it('moveSession() invokes folderCrud:moveSession with fromId, toId, sessionId', async () => {
    await folderCrudApi.moveSession('f-1', 'f-2', 's-42');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:moveSession', {
      fromId: 'f-1',
      toId: 'f-2',
      sessionId: 's-42',
    });
  });

  it('moveSession() passes null fromId when moving from uncategorized', async () => {
    await folderCrudApi.moveSession(null, 'f-2', 's-42');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:moveSession', {
      fromId: null,
      toId: 'f-2',
      sessionId: 's-42',
    });
  });

  it('moveSession() passes null toId when moving to uncategorized', async () => {
    await folderCrudApi.moveSession('f-1', null, 's-42');
    expect(mockInvoke).toHaveBeenCalledWith('folderCrud:moveSession', {
      fromId: 'f-1',
      toId: null,
      sessionId: 's-42',
    });
  });

  it('onChanged() registers a listener on folderCrud:changed', () => {
    const cb = vi.fn();
    folderCrudApi.onChanged(cb);
    expect(mockOn).toHaveBeenCalledWith('folderCrud:changed', expect.any(Function));
  });

  it('onChanged() returns a cleanup that calls removeListener', () => {
    const cb = vi.fn();
    const cleanup = folderCrudApi.onChanged(cb);
    cleanup();
    expect(mockRemoveListener).toHaveBeenCalledWith('folderCrud:changed', expect.any(Function));
  });

  it('onChanged() callback receives the payload (strips IpcRendererEvent)', () => {
    const cb = vi.fn();
    folderCrudApi.onChanged(cb);
    const registeredHandler = mockOn.mock.calls[0][1] as (
      event: unknown,
      payload: unknown,
    ) => void;
    const fakeFolders = [{ id: 'f-1', name: 'Alpha', sessionIds: [], createdAt: 1, order: 0 }];
    registeredHandler({} /* IpcRendererEvent */, fakeFolders);
    expect(cb).toHaveBeenCalledWith(fakeFolders);
  });
});
