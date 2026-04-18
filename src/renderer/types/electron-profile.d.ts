/**
 * electron-profile.d.ts — IPC type contract for the profiles system (Wave 26).
 *
 * Profile is re-exported from @shared/types/profile so both the main process
 * and renderer share a single definition.
 */

export type { EffortLevel, PermissionMode, Profile, ProfileProviderId } from '@shared/types/profile';

import type { Profile } from '@shared/types/profile';

import type { IpcResult } from './electron-foundation';

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface ProfileListResult extends IpcResult {
  profiles?: Profile[];
}

export interface ProfileUpsertResult extends IpcResult {
  profile?: Profile;
}

export interface ProfileExportResult extends IpcResult {
  json?: string;
}

export interface ProfileImportResult extends IpcResult {
  profile?: Profile;
}

export interface ProfileGetDefaultResult extends IpcResult {
  profileId?: string | null;
}

export interface ProfileEstimateResult extends IpcResult {
  estimatedMs?: number;
  estimatedUsd?: number;
}

// ─── Lint types ───────────────────────────────────────────────────────────────

export interface ProfileLintItem {
  severity: 'warn' | 'error';
  message: string;
}

export interface ProfileLintResult extends IpcResult {
  lints?: ProfileLintItem[];
}

// ─── API interface ────────────────────────────────────────────────────────────

export interface ProfileAPI {
  /** List all profiles (built-ins + user). */
  list(): Promise<ProfileListResult>;

  /** Create or update a user profile. */
  upsert(profile: Profile): Promise<ProfileUpsertResult>;

  /** Delete a user profile by id. Rejects built-in profiles. */
  delete(profileId: string): Promise<IpcResult>;

  /** Set the default profile for a project root. */
  setDefault(projectRoot: string, profileId: string): Promise<IpcResult>;

  /** Get the default profile id for a project root. Returns null if unset. */
  getDefault(projectRoot: string): Promise<ProfileGetDefaultResult>;

  /** Export a profile as a JSON string. */
  export(profileId: string): Promise<ProfileExportResult>;

  /** Import a profile from a JSON string. Validates shape before saving. */
  import(json: string): Promise<ProfileImportResult>;

  /**
   * Estimate turn latency and cost for a profile at a given context token count.
   * Returns heuristic values — useful for the composer estimate pill.
   */
  estimate(args: { profileId: string; contextTokens: number }): Promise<ProfileEstimateResult>;

  /**
   * Lint a profile for incoherent settings.
   * Returns a list of warn/error diagnostics — does not mutate the store.
   */
  lint(args: { profile: Profile }): Promise<ProfileLintResult>;

  /**
   * Subscribe to profile store mutation events.
   * Fires on every upsert, delete, or import.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onChanged(callback: (profiles: Profile[]) => void): () => void;
}
