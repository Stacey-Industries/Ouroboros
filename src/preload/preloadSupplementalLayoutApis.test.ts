/**
 * preloadSupplementalLayoutApis.test.ts
 *
 * Verifies each layoutApi method invokes the correct IPC channel.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock ────────────────────────────────────────────────────────────

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
  },
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import { layoutApi } from './preloadSupplementalLayoutApis';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-abc123';
const TREE = { kind: 'leaf' as const, slotName: 'editorContent', component: { componentKey: 'editorContent' } };

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('layoutApi', () => {
  describe('getCustomLayout()', () => {
    it('invokes layout:getCustomLayout with sessionId', async () => {
      await layoutApi.getCustomLayout(SESSION_ID);
      expect(mockInvoke).toHaveBeenCalledWith('layout:getCustomLayout', SESSION_ID);
    });
  });

  describe('setCustomLayout()', () => {
    it('invokes layout:setCustomLayout with sessionId and tree', async () => {
      await layoutApi.setCustomLayout(SESSION_ID, TREE);
      expect(mockInvoke).toHaveBeenCalledWith('layout:setCustomLayout', SESSION_ID, TREE);
    });
  });

  describe('deleteCustomLayout()', () => {
    it('invokes layout:deleteCustomLayout with sessionId', async () => {
      await layoutApi.deleteCustomLayout(SESSION_ID);
      expect(mockInvoke).toHaveBeenCalledWith('layout:deleteCustomLayout', SESSION_ID);
    });
  });

  describe('promoteToGlobal()', () => {
    it('invokes layout:promoteToGlobal with name and tree', async () => {
      await layoutApi.promoteToGlobal('My Layout', TREE);
      expect(mockInvoke).toHaveBeenCalledWith('layout:promoteToGlobal', 'My Layout', TREE);
    });
  });
});
