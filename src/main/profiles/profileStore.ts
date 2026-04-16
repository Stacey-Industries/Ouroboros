/**
 * profileStore.ts — User profile persistence and retrieval (Wave 26).
 *
 * Persists user profiles under config key `profiles: Profile[]`.
 * Built-in presets are merged in at read time — they are never stored.
 *
 * Cap policy:
 *   - Max 50 user profiles (built-ins excluded).
 *   - upsert() throws when adding a new profile beyond the cap.
 *   - delete() rejects built-in profiles.
 *
 * Per-project defaults:
 *   - Stored under config key `workspaceProfileDefaults: Record<root, profileId>`.
 *   - setDefaultProfile / getDefaultProfile read/write that map.
 */

import type { Profile } from '@shared/types/profile';

import log from '../logger';
import { BUILT_IN_PROFILES } from './rolePresets';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_USER_PROFILES = 50;

// ─── Store adaptor (injected for testability) ─────────────────────────────────

export interface ProfileStoreAdaptor {
  readProfiles(): Profile[];
  writeProfiles(profiles: Profile[]): void;
  readDefaults(): Record<string, string>;
  writeDefaults(defaults: Record<string, string>): void;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ProfileStore {
  /** Returns built-in presets merged with user profiles (built-ins first). */
  listAll(): Profile[];

  /**
   * Create or update a user profile. Rejects built-in ids.
   * Throws if adding a new profile would exceed MAX_USER_PROFILES.
   */
  upsert(profile: Profile): Profile;

  /**
   * Delete a user profile by id. Throws for built-in profiles.
   * No-op (with a warning) for unknown ids.
   */
  delete(id: string): void;

  /** Associate a default profileId with a project root. */
  setDefaultProfile(projectRoot: string, profileId: string): void;

  /** Retrieve the default profileId for a project root, or null if unset. */
  getDefaultProfile(projectRoot: string): string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBuiltIn(id: string): boolean {
  return BUILT_IN_PROFILES.some((p) => p.id === id);
}

function applyListAll(adaptor: ProfileStoreAdaptor): Profile[] {
  const user = adaptor.readProfiles();
  return [...BUILT_IN_PROFILES, ...user];
}

function applyUpsert(adaptor: ProfileStoreAdaptor, profile: Profile): Profile {
  if (isBuiltIn(profile.id)) {
    throw new Error(`Cannot modify built-in profile: ${profile.id}`);
  }
  const all = adaptor.readProfiles();
  const existingIdx = all.findIndex((p) => p.id === profile.id);
  const isNew = existingIdx < 0;
  if (isNew && all.length >= MAX_USER_PROFILES) {
    throw new Error(`Profile cap reached (${MAX_USER_PROFILES}). Delete a profile before adding a new one.`);
  }
  const now = Date.now();
  const updated: Profile = { ...profile, updatedAt: now, createdAt: isNew ? now : profile.createdAt };
  if (isNew) {
    all.push(updated);
  } else {
    all.splice(existingIdx, 1, updated);
  }
  adaptor.writeProfiles(all);
  return updated;
}

function applyDelete(adaptor: ProfileStoreAdaptor, id: string): void {
  if (isBuiltIn(id)) {
    throw new Error(`Cannot delete built-in profile: ${id}`);
  }
  const all = adaptor.readProfiles();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) {
    log.warn('[profileStore] delete: profile not found:', id);
    return;
  }
  all.splice(idx, 1);
  adaptor.writeProfiles(all);
}

function applySetDefault(
  adaptor: ProfileStoreAdaptor,
  projectRoot: string,
  profileId: string,
): void {
  const defaults = adaptor.readDefaults();
  // eslint-disable-next-line security/detect-object-injection
  defaults[projectRoot] = profileId;
  adaptor.writeDefaults(defaults);
}

function applyGetDefault(
  adaptor: ProfileStoreAdaptor,
  projectRoot: string,
): string | null {
  const defaults = adaptor.readDefaults();
  // eslint-disable-next-line security/detect-object-injection
  return defaults[projectRoot] ?? null;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildProfileStore(adaptor: ProfileStoreAdaptor): ProfileStore {
  return {
    listAll: () => applyListAll(adaptor),
    upsert: (profile) => applyUpsert(adaptor, profile),
    delete: (id) => applyDelete(adaptor, id),
    setDefaultProfile: (root, profileId) => applySetDefault(adaptor, root, profileId),
    getDefaultProfile: (root) => applyGetDefault(adaptor, root),
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: ProfileStore | null = null;

export function initProfileStore(): void {
  if (singleton) return;
  // Lazy-import config to avoid loading electron-store in test environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getConfigValue, setConfigValue } = require('../config') as typeof import('../config');
  const adaptor: ProfileStoreAdaptor = {
    readProfiles: () => {
      const stored = getConfigValue('profiles') as unknown as Profile[] | undefined;
      return Array.isArray(stored) ? stored : [];
    },
    writeProfiles: (profiles) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setConfigValue('profiles' as any, profiles as any);
    },
    readDefaults: () => {
      const stored = getConfigValue('workspaceProfileDefaults') as Record<string, string> | undefined;
      return stored && typeof stored === 'object' ? stored : {};
    },
    writeDefaults: (defaults) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setConfigValue('workspaceProfileDefaults' as any, defaults as any);
    },
  };
  singleton = buildProfileStore(adaptor);
  log.info('[profileStore] initialised');
}

export function getProfileStore(): ProfileStore | null {
  return singleton;
}

export function closeProfileStore(): void {
  singleton = null;
}
