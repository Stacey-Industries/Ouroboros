/**
 * profileStore.test.ts — Unit tests for the profile store (Wave 26).
 *
 * Uses an in-memory adaptor so no electron-store or filesystem is touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { Profile } from '@shared/types/profile';
import { MAX_USER_PROFILES, buildProfileStore } from './profileStore';
import type { ProfileStoreAdaptor } from './profileStore';
import { BUILT_IN_PROFILES } from './rolePresets';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdaptor(): ProfileStoreAdaptor {
  let profiles: Profile[] = [];
  let defaults: Record<string, string> = {};
  return {
    readProfiles: () => profiles.slice(),
    writeProfiles: (p) => { profiles = p.slice(); },
    readDefaults: () => ({ ...defaults }),
    writeDefaults: (d) => { defaults = { ...d }; },
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: `user-${Math.random().toString(36).slice(2)}`,
    name: 'Test Profile',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('profileStore', () => {
  let adaptor: ProfileStoreAdaptor;

  beforeEach(() => {
    adaptor = makeAdaptor();
  });

  // ── listAll ───────────────────────────────────────────────────────────────

  describe('listAll()', () => {
    it('returns built-in profiles when no user profiles exist', () => {
      const store = buildProfileStore(adaptor);
      const all = store.listAll();
      expect(all.length).toBeGreaterThanOrEqual(BUILT_IN_PROFILES.length);
      for (const bi of BUILT_IN_PROFILES) {
        expect(all.find((p) => p.id === bi.id)).toBeDefined();
      }
    });

    it('returns built-ins before user profiles', () => {
      const store = buildProfileStore(adaptor);
      store.upsert(makeProfile({ id: 'user-1', name: 'My Profile' }));
      const all = store.listAll();
      const builtInIds = BUILT_IN_PROFILES.map((p) => p.id);
      const firstUserIdx = all.findIndex((p) => !builtInIds.includes(p.id));
      const lastBuiltInIdx = all.reduce(
        (acc, p, i) => (builtInIds.includes(p.id) ? i : acc),
        -1,
      );
      expect(lastBuiltInIdx).toBeLessThan(firstUserIdx);
    });

    it('includes newly upserted user profiles', () => {
      const store = buildProfileStore(adaptor);
      const p = makeProfile({ id: 'user-x', name: 'X' });
      store.upsert(p);
      expect(store.listAll().find((x) => x.id === 'user-x')).toBeDefined();
    });
  });

  // ── upsert ────────────────────────────────────────────────────────────────

  describe('upsert()', () => {
    it('creates a new profile and sets createdAt / updatedAt', () => {
      const store = buildProfileStore(adaptor);
      const before = Date.now();
      const result = store.upsert(makeProfile({ id: 'u1' }));
      expect(result.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('updates an existing profile without changing createdAt', () => {
      const store = buildProfileStore(adaptor);
      const created = store.upsert(makeProfile({ id: 'u1', name: 'Before' }));
      const updated = store.upsert({ ...created, name: 'After' });
      expect(updated.name).toBe('After');
      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('persists the profile via the adaptor', () => {
      const store = buildProfileStore(adaptor);
      store.upsert(makeProfile({ id: 'u1' }));
      expect(adaptor.readProfiles()).toHaveLength(1);
    });

    it('throws when trying to upsert a built-in profile', () => {
      const store = buildProfileStore(adaptor);
      expect(() => store.upsert({ ...BUILT_IN_PROFILES[0], name: 'Hacked' })).toThrow(
        /built-in/i,
      );
    });

    it(`throws when user profile cap (${MAX_USER_PROFILES}) is exceeded`, () => {
      const store = buildProfileStore(adaptor);
      for (let i = 0; i < MAX_USER_PROFILES; i++) {
        store.upsert(makeProfile({ id: `u${i}` }));
      }
      expect(() => store.upsert(makeProfile({ id: 'overflow' }))).toThrow(/cap/i);
    });

    it('updating an existing profile does not count against the cap', () => {
      const store = buildProfileStore(adaptor);
      for (let i = 0; i < MAX_USER_PROFILES; i++) {
        store.upsert(makeProfile({ id: `u${i}` }));
      }
      // Updating u0 — already exists, should not throw
      expect(() =>
        store.upsert(makeProfile({ id: 'u0', name: 'Updated' })),
      ).not.toThrow();
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('removes a user profile', () => {
      const store = buildProfileStore(adaptor);
      store.upsert(makeProfile({ id: 'u1' }));
      store.delete('u1');
      expect(store.listAll().find((p) => p.id === 'u1')).toBeUndefined();
    });

    it('throws when trying to delete a built-in profile', () => {
      const store = buildProfileStore(adaptor);
      expect(() => store.delete(BUILT_IN_PROFILES[0].id)).toThrow(/built-in/i);
    });

    it('is a no-op (warn only) for unknown ids', () => {
      const store = buildProfileStore(adaptor);
      expect(() => store.delete('nonexistent')).not.toThrow();
    });
  });

  // ── setDefaultProfile / getDefaultProfile ─────────────────────────────────

  describe('setDefaultProfile() / getDefaultProfile()', () => {
    it('returns null when no default is set', () => {
      const store = buildProfileStore(adaptor);
      expect(store.getDefaultProfile('/projects/foo')).toBeNull();
    });

    it('stores and retrieves a default profile for a project root', () => {
      const store = buildProfileStore(adaptor);
      store.setDefaultProfile('/projects/foo', 'builtin-reviewer');
      expect(store.getDefaultProfile('/projects/foo')).toBe('builtin-reviewer');
    });

    it('different roots have independent defaults', () => {
      const store = buildProfileStore(adaptor);
      store.setDefaultProfile('/projects/a', 'builtin-reviewer');
      store.setDefaultProfile('/projects/b', 'builtin-explorer');
      expect(store.getDefaultProfile('/projects/a')).toBe('builtin-reviewer');
      expect(store.getDefaultProfile('/projects/b')).toBe('builtin-explorer');
    });

    it('overwriting a default updates the stored value', () => {
      const store = buildProfileStore(adaptor);
      store.setDefaultProfile('/projects/foo', 'builtin-reviewer');
      store.setDefaultProfile('/projects/foo', 'builtin-debugger');
      expect(store.getDefaultProfile('/projects/foo')).toBe('builtin-debugger');
    });

    it('persists defaults via the adaptor', () => {
      const store = buildProfileStore(adaptor);
      store.setDefaultProfile('/projects/foo', 'builtin-scaffolder');
      expect(adaptor.readDefaults()['/projects/foo']).toBe('builtin-scaffolder');
    });
  });
});
