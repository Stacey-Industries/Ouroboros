/**
 * preloadSupplementalPinnedContextApis.test.ts
 *
 * Verifies each pinnedContextApi method invokes the correct IPC channel and
 * that the onChanged subscription wires / unwires correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock ────────────────────────────────────────────────────────────

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

import { pinnedContextApi } from './preloadSupplementalPinnedContextApis';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'sess-abc';
const ITEM_ID = 'item-xyz';
const ITEM_PAYLOAD = {
  type: 'user-file' as const,
  source: '/src/foo.ts',
  title: 'foo.ts',
  content: 'export {}',
  tokens: 4,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('pinnedContextApi', () => {
  describe('add()', () => {
    it('invokes pinnedContext:add with sessionId and item', async () => {
      await pinnedContextApi.add(SESSION_ID, ITEM_PAYLOAD);
      expect(mockInvoke).toHaveBeenCalledWith('pinnedContext:add', {
        sessionId: SESSION_ID,
        item: ITEM_PAYLOAD,
      });
    });
  });

  describe('remove()', () => {
    it('invokes pinnedContext:remove with sessionId and itemId', async () => {
      await pinnedContextApi.remove(SESSION_ID, ITEM_ID);
      expect(mockInvoke).toHaveBeenCalledWith('pinnedContext:remove', {
        sessionId: SESSION_ID,
        itemId: ITEM_ID,
      });
    });
  });

  describe('dismiss()', () => {
    it('invokes pinnedContext:dismiss with sessionId and itemId', async () => {
      await pinnedContextApi.dismiss(SESSION_ID, ITEM_ID);
      expect(mockInvoke).toHaveBeenCalledWith('pinnedContext:dismiss', {
        sessionId: SESSION_ID,
        itemId: ITEM_ID,
      });
    });
  });

  describe('list()', () => {
    it('invokes pinnedContext:list with sessionId only when includeDismissed omitted', async () => {
      await pinnedContextApi.list(SESSION_ID);
      expect(mockInvoke).toHaveBeenCalledWith('pinnedContext:list', {
        sessionId: SESSION_ID,
        includeDismissed: undefined,
      });
    });

    it('invokes pinnedContext:list with includeDismissed: true when specified', async () => {
      await pinnedContextApi.list(SESSION_ID, true);
      expect(mockInvoke).toHaveBeenCalledWith('pinnedContext:list', {
        sessionId: SESSION_ID,
        includeDismissed: true,
      });
    });
  });

  describe('onChanged()', () => {
    it('registers a listener on pinnedContext:changed', () => {
      const cb = vi.fn();
      pinnedContextApi.onChanged(cb);
      expect(mockOn).toHaveBeenCalledWith('pinnedContext:changed', expect.any(Function));
    });

    it('returns a cleanup function that calls removeListener', () => {
      const cb = vi.fn();
      const cleanup = pinnedContextApi.onChanged(cb);
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith(
        'pinnedContext:changed',
        expect.any(Function),
      );
    });

    it('strips the IpcRendererEvent and forwards the payload to callback', () => {
      const cb = vi.fn();
      pinnedContextApi.onChanged(cb);
      const registeredHandler = mockOn.mock.calls[0][1] as (
        event: unknown,
        payload: unknown,
      ) => void;
      const payload = { sessionId: SESSION_ID, items: [] };
      registeredHandler({} /* IpcRendererEvent */, payload);
      expect(cb).toHaveBeenCalledWith(payload);
    });
  });
});
