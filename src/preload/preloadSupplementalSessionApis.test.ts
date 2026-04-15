/**
 * preloadSupplementalSessionApis.test.ts
 *
 * Verifies each sessionCrudApi method invokes the correct IPC channel.
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

import { sessionCrudApi } from './preloadSupplementalSessionApis';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('sessionCrudApi', () => {
  it('list() invokes sessionCrud:list', async () => {
    await sessionCrudApi.list();
    expect(mockInvoke).toHaveBeenCalledWith('sessionCrud:list');
  });

  it('active() invokes sessionCrud:active', async () => {
    await sessionCrudApi.active();
    expect(mockInvoke).toHaveBeenCalledWith('sessionCrud:active');
  });

  it('create() invokes sessionCrud:create with projectRoot', async () => {
    await sessionCrudApi.create('/projects/new');
    expect(mockInvoke).toHaveBeenCalledWith('sessionCrud:create', { projectRoot: '/projects/new' });
  });

  it('activate() invokes sessionCrud:activate with sessionId', async () => {
    await sessionCrudApi.activate('abc-123');
    expect(mockInvoke).toHaveBeenCalledWith('sessionCrud:activate', { sessionId: 'abc-123' });
  });

  it('archive() invokes sessionCrud:archive with sessionId', async () => {
    await sessionCrudApi.archive('def-456');
    expect(mockInvoke).toHaveBeenCalledWith('sessionCrud:archive', { sessionId: 'def-456' });
  });

  it('delete() invokes sessionCrud:delete with sessionId', async () => {
    await sessionCrudApi.delete('ghi-789');
    expect(mockInvoke).toHaveBeenCalledWith('sessionCrud:delete', { sessionId: 'ghi-789' });
  });

  it('onChanged() registers a listener on sessionCrud:changed', () => {
    const cb = vi.fn();
    sessionCrudApi.onChanged(cb);
    expect(mockOn).toHaveBeenCalledWith('sessionCrud:changed', expect.any(Function));
  });

  it('onChanged() returns a cleanup that calls removeListener', () => {
    const cb = vi.fn();
    const cleanup = sessionCrudApi.onChanged(cb);
    cleanup();
    expect(mockRemoveListener).toHaveBeenCalledWith('sessionCrud:changed', expect.any(Function));
  });

  it('onChanged() callback receives the payload (strips IpcRendererEvent)', () => {
    const cb = vi.fn();
    sessionCrudApi.onChanged(cb);
    const registeredHandler = mockOn.mock.calls[0][1] as (event: unknown, payload: unknown) => void;
    const fakeSessions = [{ id: 'x', projectRoot: '/p' }];
    registeredHandler({} /* IpcRendererEvent */, fakeSessions);
    expect(cb).toHaveBeenCalledWith(fakeSessions);
  });
});
