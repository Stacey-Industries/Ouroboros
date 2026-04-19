/**
 * profileCrud.upsert.lint.test.ts — Phase L Wave 41.
 *
 * Tests that profileCrud:upsert rejects profiles with severity:'error' lint items
 * (e.g. bypass+Bash combinations) via the security gate in handleUpsert.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock fns ─────────────────────────────────────────────────────────

const { mockSend, mockIsDestroyed, mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockIsDestroyed: vi.fn(() => false),
  mockHandle: vi.fn(),
  mockRemoveHandler: vi.fn(),
}));

// ─── Electron mock ─────────────────────────────────────────────────────────────

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

import type { ProfileLint } from '../profiles/profileLint';
import type { ProfileStore } from '../profiles/profileStore';

let mockStore: ProfileStore | null = null;

vi.mock('../profiles/profileStore', () => ({
  getProfileStore: () => mockStore,
}));

// ─── Subject ───────────────────────────────────────────────────────────────────

import { registerProfileCrudHandlers } from './profileCrud';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeUserProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'lint-gate-test',
    name: 'Test Profile',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeInMemoryStore(): ProfileStore {
  let profiles: Profile[] = [];
  const defaults: Record<string, string> = {};
  return {
    listAll: () => [...profiles],
    upsert: (p) => {
      const idx = profiles.findIndex((x) => x.id === p.id);
      const now = Date.now();
      const saved = { ...p, updatedAt: now, createdAt: idx < 0 ? now : p.createdAt };
      if (idx < 0) profiles.push(saved); else profiles.splice(idx, 1, saved);
      return saved;
    },
    delete: (id) => { profiles = profiles.filter((p) => p.id !== id); },
    // eslint-disable-next-line security/detect-object-injection -- test fixture; root is a controlled string from tests, not user input
    setDefaultProfile: (root, profileId) => { defaults[root] = profileId; },
    // eslint-disable-next-line security/detect-object-injection -- test fixture; same rationale
    getDefaultProfile: (root) => defaults[root] ?? null,
  };
}

function getHandler(channel: string): (_event: unknown, args: unknown) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) throw new Error(`No handler registered for channel: ${channel}`);
  return call[1] as (_event: unknown, args: unknown) => Promise<unknown>;
}

async function invoke(channel: string, args?: unknown): Promise<unknown> {
  return getHandler(channel)(null, args);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('profileCrud:upsert — lint error gate', () => {
  beforeEach(() => {
    mockStore = makeInMemoryStore();
    mockSend.mockClear();
    mockHandle.mockClear();
    mockRemoveHandler.mockClear();
    registerProfileCrudHandlers();
  });

  it('rejects a bypass+Bash profile with profile-lint-errors', async () => {
    const profile = makeUserProfile({
      permissionMode: 'bypass',
      enabledTools: ['Read', 'Bash'],
    });

    const res = await invoke('profileCrud:upsert', { profile }) as {
      success: boolean;
      error?: string;
      lintItems?: ProfileLint[];
    };

    expect(res.success).toBe(false);
    expect(res.error).toBe('profile-lint-errors');
    expect(Array.isArray(res.lintItems)).toBe(true);
    expect(res.lintItems?.length).toBeGreaterThan(0);
    expect(res.lintItems?.every((l) => l.severity === 'error')).toBe(true);
  });

  it('does not store the profile or broadcast when rejected by lint', async () => {
    const profile = makeUserProfile({
      permissionMode: 'bypass',
      enabledTools: ['Read', 'Bash'],
    });

    await invoke('profileCrud:upsert', { profile });

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockStore!.listAll()).toHaveLength(0);
  });

  it('allows a bypass profile without Bash (only warns, does not error)', async () => {
    const profile = makeUserProfile({
      permissionMode: 'bypass',
      enabledTools: ['Read', 'Write'],
    });

    const res = await invoke('profileCrud:upsert', { profile }) as { success: boolean };
    expect(res.success).toBe(true);
  });

  it('allows a normal+Bash profile with no lint errors', async () => {
    const profile = makeUserProfile({
      permissionMode: 'normal',
      enabledTools: ['Read', 'Bash', 'Write'],
    });

    const res = await invoke('profileCrud:upsert', { profile }) as { success: boolean };
    expect(res.success).toBe(true);
  });

  it('allows a clean profile with no restrictive permissionMode', async () => {
    const profile = makeUserProfile({
      enabledTools: ['Read', 'Grep', 'Glob'],
    });

    const res = await invoke('profileCrud:upsert', { profile }) as { success: boolean };
    expect(res.success).toBe(true);
  });

  it('broadcasts profileCrud:changed only on accepted upserts', async () => {
    const clean = makeUserProfile({ enabledTools: ['Read'] });
    await invoke('profileCrud:upsert', { profile: clean });
    expect(mockSend).toHaveBeenCalledWith('profileCrud:changed', expect.any(Array));

    mockSend.mockClear();

    const dangerous = makeUserProfile({
      id: 'bypass-bash',
      permissionMode: 'bypass',
      enabledTools: ['Bash'],
    });
    await invoke('profileCrud:upsert', { profile: dangerous });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
