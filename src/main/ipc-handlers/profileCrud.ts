/**
 * ipc-handlers/profileCrud.ts — IPC handler registrar for profile CRUD (Wave 26).
 *
 * Channels:
 *   profileCrud:list                          → { success, profiles }
 *   profileCrud:upsert    { profile }         → { success, profile }
 *   profileCrud:delete    { profileId }       → { success }
 *   profileCrud:setDefault { projectRoot, profileId } → { success }
 *   profileCrud:getDefault { projectRoot }    → { success, profileId }
 *   profileCrud:export    { profileId }       → { success, json }
 *   profileCrud:import    { json }            → { success, profile }
 *   profileCrud:estimate  { profileId, contextTokens } → { success, estimatedMs, estimatedUsd }
 *   profileCrud:lint      { profile }                  → { success, lints }
 *
 * Emits profileCrud:changed to all renderer windows on every mutation.
 */

import type { Profile } from '@shared/types/profile';
import { BrowserWindow, ipcMain } from 'electron';

import log from '../logger';
import { estimateTurnCost } from '../profiles/effortEstimator';
import type { ProfileLint } from '../profiles/profileLint';
import { lintProfile } from '../profiles/profileLint';
import { getProfileStore } from '../profiles/profileStore';

// ─── Response helpers ─────────────────────────────────────────────────────────

type OkResult<T extends object> = { success: true } & T;
type FailResult = { success: false; error: string };
type HandlerResult<T extends object> = OkResult<T> | FailResult;

function ok<T extends object>(data: T): OkResult<T> {
  return { success: true, ...data };
}

function fail(err: unknown): FailResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg };
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastChanged(): void {
  const store = getProfileStore();
  const profiles = store ? store.listAll() : [];
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('profileCrud:changed', profiles);
    }
  });
}

// ─── Import validation ────────────────────────────────────────────────────────

function isValidProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' && p['id'].length > 0 &&
    typeof p['name'] === 'string' && p['name'].length > 0 &&
    typeof p['createdAt'] === 'number' &&
    typeof p['updatedAt'] === 'number'
  );
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleList(): HandlerResult<{ profiles: Profile[] }> {
  const store = getProfileStore();
  if (!store) return ok({ profiles: [] });
  return ok({ profiles: store.listAll() });
}

function handleUpsert(
  args: unknown,
): HandlerResult<{ profile: Profile }> | { success: false; error: 'profile-lint-errors'; lintItems: ProfileLint[] } {
  const { profile } = (args ?? {}) as { profile?: unknown };
  if (!isValidProfile(profile)) return fail('profile is missing required fields (id, name)');
  const store = getProfileStore();
  if (!store) return fail('profileStore not initialised');

  // Security boundary: reject profiles with any severity:'error' lint item.
  // Currently gates bypass+Bash combinations; also catches any future error-level rules.
  const lintItems = lintProfile(profile);
  const errors = lintItems.filter((l) => l.severity === 'error');
  if (errors.length > 0) {
    return { success: false, error: 'profile-lint-errors', lintItems: errors };
  }

  const saved = store.upsert(profile);
  broadcastChanged();
  return ok({ profile: saved });
}

function handleDelete(args: unknown): HandlerResult<object> {
  const { profileId } = (args ?? {}) as { profileId?: string };
  if (typeof profileId !== 'string' || !profileId) return fail('profileId is required');
  const store = getProfileStore();
  if (!store) return fail('profileStore not initialised');
  store.delete(profileId);
  broadcastChanged();
  return ok({});
}

function handleSetDefault(args: unknown): HandlerResult<object> {
  const { projectRoot, profileId } = (args ?? {}) as {
    projectRoot?: string;
    profileId?: string;
  };
  if (typeof projectRoot !== 'string' || !projectRoot) return fail('projectRoot is required');
  if (typeof profileId !== 'string' || !profileId) return fail('profileId is required');
  const store = getProfileStore();
  if (!store) return fail('profileStore not initialised');
  store.setDefaultProfile(projectRoot, profileId);
  return ok({});
}

function handleGetDefault(args: unknown): HandlerResult<{ profileId: string | null }> {
  const { projectRoot } = (args ?? {}) as { projectRoot?: string };
  if (typeof projectRoot !== 'string' || !projectRoot) return fail('projectRoot is required');
  const store = getProfileStore();
  if (!store) return ok({ profileId: null });
  return ok({ profileId: store.getDefaultProfile(projectRoot) });
}

function handleExport(args: unknown): HandlerResult<{ json: string }> {
  const { profileId } = (args ?? {}) as { profileId?: string };
  if (typeof profileId !== 'string' || !profileId) return fail('profileId is required');
  const store = getProfileStore();
  if (!store) return fail('profileStore not initialised');
  const all = store.listAll();
  const profile = all.find((p) => p.id === profileId);
  if (!profile) return fail(`profile not found: ${profileId}`);
  return ok({ json: JSON.stringify(profile, null, 2) });
}

function handleEstimate(
  args: unknown,
): HandlerResult<{ estimatedMs: number; estimatedUsd: number }> {
  const { profileId, contextTokens } = (args ?? {}) as {
    profileId?: string;
    contextTokens?: number;
  };
  if (typeof profileId !== 'string' || !profileId) return fail('profileId is required');
  if (typeof contextTokens !== 'number') return fail('contextTokens must be a number');
  const store = getProfileStore();
  if (!store) return ok({ estimatedMs: 0, estimatedUsd: 0 });
  const all = store.listAll();
  const profile = all.find((p) => p.id === profileId);
  if (!profile) return fail(`profile not found: ${profileId}`);
  return ok(estimateTurnCost(profile, contextTokens));
}

function handleLint(args: unknown): HandlerResult<{ lints: ProfileLint[] }> {
  const { profile } = (args ?? {}) as { profile?: unknown };
  if (!isValidProfile(profile)) return fail('profile is missing required fields (id, name)');
  return ok({ lints: lintProfile(profile) });
}

function handleImport(args: unknown): HandlerResult<{ profile: Profile }> {
  const { json } = (args ?? {}) as { json?: string };
  if (typeof json !== 'string' || !json) return fail('json is required');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail('json is not valid JSON');
  }
  if (!isValidProfile(parsed)) return fail('json does not match Profile shape');
  const store = getProfileStore();
  if (!store) return fail('profileStore not initialised');
  // Imported profiles must not be built-in
  const candidate: Profile = { ...parsed, builtIn: false };
  const saved = store.upsert(candidate);
  broadcastChanged();
  return ok({ profile: saved });
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerProfileCrudHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await Promise.resolve(handler(...args));
      } catch (err) {
        log.error(`[profileCrud ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('profileCrud:list', () => handleList());
  reg('profileCrud:upsert', (args) => handleUpsert(args));
  reg('profileCrud:delete', (args) => handleDelete(args));
  reg('profileCrud:setDefault', (args) => handleSetDefault(args));
  reg('profileCrud:getDefault', (args) => handleGetDefault(args));
  reg('profileCrud:export', (args) => handleExport(args));
  reg('profileCrud:import', (args) => handleImport(args));
  reg('profileCrud:estimate', (args) => handleEstimate(args));
  reg('profileCrud:lint', (args) => handleLint(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupProfileCrudHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
