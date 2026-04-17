/**
 * preloadSupplementalProfileApis.test.ts
 *
 * Verifies each profileCrudApi method invokes the correct IPC channel and
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────
import type { Profile } from '../renderer/types/electron';
import { profileCrudApi } from './preloadSupplementalProfileApis';

const PROFILE: Profile = {
  id: 'user-test-1',
  name: 'My Profile',
  createdAt: 1000,
  updatedAt: 1000,
};
const PROFILE_ID = PROFILE.id;
const PROJECT_ROOT = '/projects/test';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('profileCrudApi', () => {
  describe('list()', () => {
    it('invokes profileCrud:list with no args', async () => {
      await profileCrudApi.list();
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:list');
    });
  });

  describe('upsert()', () => {
    it('invokes profileCrud:upsert with the profile object', async () => {
      await profileCrudApi.upsert(PROFILE);
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:upsert', { profile: PROFILE });
    });
  });

  describe('delete()', () => {
    it('invokes profileCrud:delete with profileId', async () => {
      await profileCrudApi.delete(PROFILE_ID);
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:delete', { profileId: PROFILE_ID });
    });
  });

  describe('setDefault()', () => {
    it('invokes profileCrud:setDefault with projectRoot and profileId', async () => {
      await profileCrudApi.setDefault(PROJECT_ROOT, PROFILE_ID);
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:setDefault', {
        projectRoot: PROJECT_ROOT,
        profileId: PROFILE_ID,
      });
    });
  });

  describe('getDefault()', () => {
    it('invokes profileCrud:getDefault with projectRoot', async () => {
      await profileCrudApi.getDefault(PROJECT_ROOT);
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:getDefault', {
        projectRoot: PROJECT_ROOT,
      });
    });
  });

  describe('export()', () => {
    it('invokes profileCrud:export with profileId', async () => {
      await profileCrudApi.export(PROFILE_ID);
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:export', { profileId: PROFILE_ID });
    });
  });

  describe('import()', () => {
    it('invokes profileCrud:import with json string', async () => {
      const json = JSON.stringify(PROFILE);
      await profileCrudApi.import(json);
      expect(mockInvoke).toHaveBeenCalledWith('profileCrud:import', { json });
    });
  });

  describe('onChanged()', () => {
    it('registers a listener on profileCrud:changed', () => {
      const cb = vi.fn();
      profileCrudApi.onChanged(cb);
      expect(mockOn).toHaveBeenCalledWith('profileCrud:changed', expect.any(Function));
    });

    it('returns a cleanup function that calls removeListener', () => {
      const cb = vi.fn();
      const cleanup = profileCrudApi.onChanged(cb);
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith(
        'profileCrud:changed',
        expect.any(Function),
      );
    });

    it('strips the IpcRendererEvent and forwards the payload to callback', () => {
      const cb = vi.fn();
      profileCrudApi.onChanged(cb);
      const registeredHandler = mockOn.mock.calls[0][1] as (
        event: unknown,
        payload: unknown,
      ) => void;
      const profiles: Profile[] = [PROFILE];
      registeredHandler({} /* IpcRendererEvent */, profiles);
      expect(cb).toHaveBeenCalledWith(profiles);
    });
  });
});
