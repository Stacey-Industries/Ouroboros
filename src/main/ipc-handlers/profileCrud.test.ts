/**
 * profileCrud.test.ts — Unit tests for the profileCrud IPC handler (Wave 26).
 *
 * Mocks electron, logger, and profileStore so no Electron runtime is needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock fns (available inside vi.mock factories) ────────────────────

const {
  mockSend,
  mockIsDestroyed,
  mockHandle,
  mockRemoveHandler,
} = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockIsDestroyed: vi.fn(() => false),
  mockHandle: vi.fn(),
  mockRemoveHandler: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      { isDestroyed: mockIsDestroyed, webContents: { send: mockSend } },
    ]),
  },
  ipcMain: {
    handle: mockHandle,
    removeHandler: mockRemoveHandler,
  },
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Profile store mock ───────────────────────────────────────────────────────

import type { Profile } from '@shared/types/profile';
import type { ProfileStore } from '../profiles/profileStore';
import { BUILT_IN_PROFILES } from '../profiles/rolePresets';

let mockStore: ProfileStore | null = null;

vi.mock('../profiles/profileStore', () => ({
  getProfileStore: () => mockStore,
}));

// ─── Subject (imported after mocks) ──────────────────────────────────────────

import {
  cleanupProfileCrudHandlers,
  registerProfileCrudHandlers,
} from './profileCrud';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUserProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-test-1',
    name: 'My Profile',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeInMemoryStore(): ProfileStore {
  let profiles: Profile[] = [];
  let defaults: Record<string, string> = {};
  return {
    listAll: () => [...BUILT_IN_PROFILES, ...profiles],
    upsert: (p) => {
      const idx = profiles.findIndex((x) => x.id === p.id);
      const now = Date.now();
      const saved = { ...p, updatedAt: now, createdAt: idx < 0 ? now : p.createdAt };
      if (idx < 0) profiles.push(saved); else profiles.splice(idx, 1, saved);
      return saved;
    },
    delete: (id) => {
      if (BUILT_IN_PROFILES.some((b) => b.id === id)) {
        throw new Error(`Cannot delete built-in profile: ${id}`);
      }
      profiles = profiles.filter((p) => p.id !== id);
    },
    setDefaultProfile: (root, profileId) => { defaults[root] = profileId; },
    getDefaultProfile: (root) => defaults[root] ?? null,
  };
}

// Extract handler registered for a channel from mockHandle.mock.calls
function getHandler(channel: string): (_event: unknown, args: unknown) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) throw new Error(`No handler registered for channel: ${channel}`);
  return call[1] as (_event: unknown, args: unknown) => Promise<unknown>;
}

async function invoke(channel: string, args?: unknown): Promise<unknown> {
  return getHandler(channel)(null, args);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('profileCrud IPC handlers', () => {
  beforeEach(() => {
    mockStore = makeInMemoryStore();
    mockSend.mockClear();
    mockHandle.mockClear();
    mockRemoveHandler.mockClear();
    registerProfileCrudHandlers();
  });

  // ── profileCrud:list ──────────────────────────────────────────────────────

  describe('profileCrud:list', () => {
    it('returns success with all profiles including built-ins', async () => {
      const res = await invoke('profileCrud:list') as { success: boolean; profiles: Profile[] };
      expect(res.success).toBe(true);
      expect(res.profiles.length).toBeGreaterThanOrEqual(BUILT_IN_PROFILES.length);
    });

    it('returns success with empty array when store is null', async () => {
      mockStore = null;
      const res = await invoke('profileCrud:list') as { success: boolean; profiles: Profile[] };
      expect(res.success).toBe(true);
      expect(res.profiles).toEqual([]);
    });
  });

  // ── profileCrud:upsert ────────────────────────────────────────────────────

  describe('profileCrud:upsert', () => {
    it('creates a profile and returns it', async () => {
      const profile = makeUserProfile();
      const res = await invoke('profileCrud:upsert', { profile }) as { success: boolean; profile: Profile };
      expect(res.success).toBe(true);
      expect(res.profile.id).toBe('user-test-1');
    });

    it('broadcasts profileCrud:changed on success', async () => {
      await invoke('profileCrud:upsert', { profile: makeUserProfile() });
      expect(mockSend).toHaveBeenCalledWith('profileCrud:changed', expect.any(Array));
    });

    it('returns failure for missing profile', async () => {
      const res = await invoke('profileCrud:upsert', {}) as { success: boolean; error: string };
      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
    });

    it('returns failure when store is null', async () => {
      mockStore = null;
      const res = await invoke('profileCrud:upsert', { profile: makeUserProfile() }) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  // ── profileCrud:delete ────────────────────────────────────────────────────

  describe('profileCrud:delete', () => {
    it('deletes a user profile', async () => {
      await invoke('profileCrud:upsert', { profile: makeUserProfile() });
      const res = await invoke('profileCrud:delete', { profileId: 'user-test-1' }) as { success: boolean };
      expect(res.success).toBe(true);
    });

    it('broadcasts profileCrud:changed on deletion', async () => {
      await invoke('profileCrud:upsert', { profile: makeUserProfile() });
      mockSend.mockClear();
      await invoke('profileCrud:delete', { profileId: 'user-test-1' });
      expect(mockSend).toHaveBeenCalledWith('profileCrud:changed', expect.any(Array));
    });

    it('returns failure when trying to delete a built-in', async () => {
      const res = await invoke('profileCrud:delete', { profileId: BUILT_IN_PROFILES[0].id }) as { success: boolean };
      expect(res.success).toBe(false);
    });

    it('returns failure for missing profileId', async () => {
      const res = await invoke('profileCrud:delete', {}) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  // ── profileCrud:setDefault / getDefault ───────────────────────────────────

  describe('profileCrud:setDefault / getDefault', () => {
    it('stores and retrieves a per-project default', async () => {
      await invoke('profileCrud:setDefault', { projectRoot: '/proj/a', profileId: 'builtin-reviewer' });
      const res = await invoke('profileCrud:getDefault', { projectRoot: '/proj/a' }) as { success: boolean; profileId: string };
      expect(res.success).toBe(true);
      expect(res.profileId).toBe('builtin-reviewer');
    });

    it('returns null profileId when no default is set', async () => {
      const res = await invoke('profileCrud:getDefault', { projectRoot: '/proj/unset' }) as { success: boolean; profileId: string | null };
      expect(res.success).toBe(true);
      expect(res.profileId).toBeNull();
    });

    it('setDefault returns failure for missing projectRoot', async () => {
      const res = await invoke('profileCrud:setDefault', { profileId: 'x' }) as { success: boolean };
      expect(res.success).toBe(false);
    });

    it('setDefault returns failure for missing profileId', async () => {
      const res = await invoke('profileCrud:setDefault', { projectRoot: '/a' }) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  // ── profileCrud:export ────────────────────────────────────────────────────

  describe('profileCrud:export', () => {
    it('exports a profile as JSON string', async () => {
      const res = await invoke('profileCrud:export', { profileId: BUILT_IN_PROFILES[0].id }) as { success: boolean; json: string };
      expect(res.success).toBe(true);
      const parsed = JSON.parse(res.json);
      expect(parsed.id).toBe(BUILT_IN_PROFILES[0].id);
    });

    it('returns failure for unknown profileId', async () => {
      const res = await invoke('profileCrud:export', { profileId: 'nonexistent' }) as { success: boolean };
      expect(res.success).toBe(false);
    });

    it('returns failure for missing profileId', async () => {
      const res = await invoke('profileCrud:export', {}) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  // ── profileCrud:import ────────────────────────────────────────────────────

  describe('profileCrud:import', () => {
    it('imports a valid profile JSON', async () => {
      const profile = makeUserProfile({ id: 'imported-1' });
      const res = await invoke('profileCrud:import', { json: JSON.stringify(profile) }) as { success: boolean; profile: Profile };
      expect(res.success).toBe(true);
      expect(res.profile.id).toBe('imported-1');
    });

    it('strips builtIn flag on import', async () => {
      const profile = makeUserProfile({ id: 'imported-2', builtIn: true });
      const res = await invoke('profileCrud:import', { json: JSON.stringify(profile) }) as { success: boolean; profile: Profile };
      expect(res.success).toBe(true);
      expect(res.profile.builtIn).toBe(false);
    });

    it('broadcasts profileCrud:changed on successful import', async () => {
      mockSend.mockClear();
      await invoke('profileCrud:import', { json: JSON.stringify(makeUserProfile({ id: 'imported-3' })) });
      expect(mockSend).toHaveBeenCalledWith('profileCrud:changed', expect.any(Array));
    });

    it('returns failure for invalid JSON', async () => {
      const res = await invoke('profileCrud:import', { json: '{bad json' }) as { success: boolean };
      expect(res.success).toBe(false);
    });

    it('returns failure for JSON missing required fields', async () => {
      const res = await invoke('profileCrud:import', { json: '{"foo":"bar"}' }) as { success: boolean };
      expect(res.success).toBe(false);
    });

    it('returns failure for missing json arg', async () => {
      const res = await invoke('profileCrud:import', {}) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  // ── cleanupProfileCrudHandlers ────────────────────────────────────────────

  describe('cleanupProfileCrudHandlers()', () => {
    it('removes all 7 registered channels', () => {
      mockRemoveHandler.mockClear();
      cleanupProfileCrudHandlers();
      expect(mockRemoveHandler).toHaveBeenCalledTimes(7);
    });
  });
});
