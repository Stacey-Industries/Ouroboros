/**
 * pinnedContext.test.ts — Unit tests for the pinnedContext IPC handler registrar.
 *
 * Stubs ipcMain, BrowserWindow, logger, and pinnedContextStore so no Electron
 * runtime or electron-store is needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockHandle, mockRemoveHandler, mockSend, mockGetAllWindows } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockRemoveHandler: vi.fn(),
  mockSend: vi.fn(),
  mockGetAllWindows: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── pinnedContextStore mock ──────────────────────────────────────────────────

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockDismiss = vi.fn();
const mockList = vi.fn();

vi.mock('../orchestration/pinnedContextStore', () => ({
  getPinnedContextStore: () => ({
    add: mockAdd,
    remove: mockRemove,
    dismiss: mockDismiss,
    list: mockList,
  }),
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import {
  cleanupPinnedContextHandlers,
  registerPinnedContextHandlers,
} from './pinnedContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HandlerFn = (_event: unknown, args: unknown) => Promise<unknown>;

/** Capture handlers registered via ipcMain.handle by channel name. */
function captureHandlers(): Map<string, HandlerFn> {
  const map = new Map<string, HandlerFn>();
  mockHandle.mockImplementation((channel: string, fn: HandlerFn) => {
    map.set(channel, fn);
  });
  return map;
}

function fakeWindow(destroyed = false) {
  return { isDestroyed: () => destroyed, webContents: { send: mockSend } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerPinnedContextHandlers', () => {
  let handlers: Map<string, HandlerFn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllWindows.mockReturnValue([fakeWindow()]);
    mockList.mockReturnValue([]);
    handlers = captureHandlers();
    registerPinnedContextHandlers();
  });

  afterEach(() => {
    cleanupPinnedContextHandlers();
  });

  it('registers four channels', () => {
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'pinnedContext:add',
        'pinnedContext:remove',
        'pinnedContext:dismiss',
        'pinnedContext:list',
      ]),
    );
  });

  // ── pinnedContext:add ─────────────────────────────────────────────────────

  describe('pinnedContext:add', () => {
    const itemPayload = {
      type: 'user-file' as const,
      source: '/src/foo.ts',
      title: 'foo.ts',
      content: 'export {}',
      tokens: 5,
    };

    it('returns success and the created item', async () => {
      const created = { ...itemPayload, id: 'uuid-1', addedAt: 1000 };
      mockAdd.mockReturnValue(created);

      const result = await handlers.get('pinnedContext:add')!(
        {},
        { sessionId: 'sess-1', item: itemPayload },
      );
      expect(result).toMatchObject({ success: true, item: created });
    });

    it('returns failure when cap reached (store returns null)', async () => {
      mockAdd.mockReturnValue(null);
      const result = await handlers.get('pinnedContext:add')!(
        {},
        { sessionId: 'sess-1', item: itemPayload },
      );
      expect(result).toMatchObject({ success: false });
    });

    it('returns failure when sessionId is missing', async () => {
      const result = await handlers.get('pinnedContext:add')!({}, { item: itemPayload });
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('sessionId') });
    });

    it('broadcasts pinnedContext:changed on success', async () => {
      const created = { ...itemPayload, id: 'uuid-2', addedAt: 2000 };
      mockAdd.mockReturnValue(created);
      await handlers.get('pinnedContext:add')!(
        {},
        { sessionId: 'sess-1', item: itemPayload },
      );
      expect(mockSend).toHaveBeenCalledWith(
        'pinnedContext:changed',
        expect.objectContaining({ sessionId: 'sess-1' }),
      );
    });
  });

  // ── pinnedContext:remove ──────────────────────────────────────────────────

  describe('pinnedContext:remove', () => {
    it('calls store.remove and returns success', async () => {
      const result = await handlers.get('pinnedContext:remove')!(
        {},
        { sessionId: 'sess-1', itemId: 'item-1' },
      );
      expect(mockRemove).toHaveBeenCalledWith('sess-1', 'item-1');
      expect(result).toMatchObject({ success: true });
    });

    it('returns failure when itemId is missing', async () => {
      const result = await handlers.get('pinnedContext:remove')!(
        {},
        { sessionId: 'sess-1' },
      );
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('itemId') });
    });
  });

  // ── pinnedContext:dismiss ─────────────────────────────────────────────────

  describe('pinnedContext:dismiss', () => {
    it('calls store.dismiss and returns success', async () => {
      const result = await handlers.get('pinnedContext:dismiss')!(
        {},
        { sessionId: 'sess-1', itemId: 'item-2' },
      );
      expect(mockDismiss).toHaveBeenCalledWith('sess-1', 'item-2');
      expect(result).toMatchObject({ success: true });
    });
  });

  // ── pinnedContext:list ────────────────────────────────────────────────────

  describe('pinnedContext:list', () => {
    it('returns items from store', async () => {
      const items = [{ id: 'x', type: 'user-file', source: '/a', title: 'a', content: '', tokens: 1, addedAt: 1 }];
      mockList.mockReturnValue(items);

      const result = await handlers.get('pinnedContext:list')!(
        {},
        { sessionId: 'sess-1' },
      );
      expect(result).toMatchObject({ success: true, items });
    });

    it('passes includeDismissed to store.list', async () => {
      mockList.mockReturnValue([]);
      await handlers.get('pinnedContext:list')!(
        {},
        { sessionId: 'sess-1', includeDismissed: true },
      );
      expect(mockList).toHaveBeenCalledWith('sess-1', { includeDismissed: true });
    });

    it('returns failure when sessionId is missing', async () => {
      const result = await handlers.get('pinnedContext:list')!({}, {});
      expect(result).toMatchObject({ success: false });
    });
  });

  // ── cleanup ───────────────────────────────────────────────────────────────

  describe('cleanupPinnedContextHandlers', () => {
    it('removes all registered channels', () => {
      cleanupPinnedContextHandlers();
      expect(mockRemoveHandler).toHaveBeenCalledWith('pinnedContext:add');
      expect(mockRemoveHandler).toHaveBeenCalledWith('pinnedContext:remove');
      expect(mockRemoveHandler).toHaveBeenCalledWith('pinnedContext:dismiss');
      expect(mockRemoveHandler).toHaveBeenCalledWith('pinnedContext:list');
    });
  });
});
