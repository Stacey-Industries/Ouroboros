/**
 * profileSpawnHelper.test.ts — Unit tests for the profile-aware spawn helper.
 *
 * Wave 36 Phase E.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetSessionProvider = vi.fn();
const mockGetDefaultProviderId = vi.fn(() => 'claude');

vi.mock('./providerRegistry', () => ({
  getSessionProvider: (...args: unknown[]) => mockGetSessionProvider(...args),
  getDefaultProviderId: () => mockGetDefaultProviderId(),
}));

// ─── Subject (imported after mocks) ──────────────────────────────────────────

import type { Profile } from '@shared/types/profile';

import type { ProfileSpawnOptions } from './profileSpawnHelper';
import { spawnForProfile } from './profileSpawnHelper';
import type { SessionHandle, SessionProvider } from './sessionProvider';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHandle(providerId: string): SessionHandle {
  return {
    id: 'sess-1',
    providerId,
    ptySessionId: 'pty-1',
    startedAt: Date.now(),
    status: 'starting',
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'prof-1',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeOpts(): ProfileSpawnOptions {
  return {
    prompt: 'hello',
    projectPath: '/proj',
    sessionId: 'sess-1',
  };
}

function makeProvider(id: string): SessionProvider {
  return {
    id,
    label: id,
    binary: id,
    checkAvailability: vi.fn(),
    spawn: vi.fn().mockResolvedValue(makeHandle(id)),
    send: vi.fn(),
    cancel: vi.fn(),
    onEvent: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('spawnForProfile', () => {
  beforeEach(() => {
    mockGetSessionProvider.mockReset();
    mockGetDefaultProviderId.mockReturnValue('claude');
  });

  it('uses the claude provider when profile has no providerId', async () => {
    const claudeProvider = makeProvider('claude');
    mockGetSessionProvider.mockReturnValue(claudeProvider);

    await spawnForProfile(makeProfile(), makeOpts());

    expect(mockGetSessionProvider).toHaveBeenCalledWith('claude');
    expect(claudeProvider.spawn).toHaveBeenCalledOnce();
  });

  it('uses the codex provider when profile.providerId is "codex"', async () => {
    const codexProvider = makeProvider('codex');
    mockGetSessionProvider.mockReturnValue(codexProvider);

    await spawnForProfile(makeProfile({ providerId: 'codex' }), makeOpts());

    expect(mockGetSessionProvider).toHaveBeenCalledWith('codex');
    expect(codexProvider.spawn).toHaveBeenCalledOnce();
  });

  it('uses the gemini provider when profile.providerId is "gemini"', async () => {
    const geminiProvider = makeProvider('gemini');
    mockGetSessionProvider.mockReturnValue(geminiProvider);

    await spawnForProfile(makeProfile({ providerId: 'gemini' }), makeOpts());

    expect(mockGetSessionProvider).toHaveBeenCalledWith('gemini');
    expect(geminiProvider.spawn).toHaveBeenCalledOnce();
  });

  it('passes a ProfileSnapshot derived from the profile to provider.spawn', async () => {
    const provider = makeProvider('claude');
    mockGetSessionProvider.mockReturnValue(provider);
    const profile = makeProfile({ providerId: 'claude', model: 'claude-sonnet-4-6' });

    await spawnForProfile(profile, makeOpts());

    const spawnArg = (provider.spawn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // profile field is a ProfileSnapshot (subset), not the full Profile object
    expect(spawnArg.profile).toBeDefined();
    expect(spawnArg.profile.id).toBe(profile.id);
    expect(spawnArg.profile.model).toBe('claude-sonnet-4-6');
  });

  it('passes all opts fields through to provider.spawn', async () => {
    const provider = makeProvider('claude');
    mockGetSessionProvider.mockReturnValue(provider);
    const opts: ProfileSpawnOptions = {
      prompt: 'do stuff',
      projectPath: '/my/project',
      sessionId: 'abc123',
      resumeThreadId: 'thread-xyz',
    };

    await spawnForProfile(makeProfile(), opts);

    const spawnArg = (provider.spawn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(spawnArg.prompt).toBe('do stuff');
    expect(spawnArg.projectPath).toBe('/my/project');
    expect(spawnArg.sessionId).toBe('abc123');
    expect(spawnArg.resumeThreadId).toBe('thread-xyz');
  });

  it('throws when provider is not registered', async () => {
    mockGetSessionProvider.mockReturnValue(null);

    await expect(
      spawnForProfile(makeProfile({ providerId: 'codex' }), makeOpts()),
    ).rejects.toThrow(/Unknown provider/);
  });

  it('returns the SessionHandle from the provider', async () => {
    const provider = makeProvider('claude');
    mockGetSessionProvider.mockReturnValue(provider);

    const handle = await spawnForProfile(makeProfile(), makeOpts());

    expect(handle.providerId).toBe('claude');
    expect(handle.id).toBe('sess-1');
  });
});
