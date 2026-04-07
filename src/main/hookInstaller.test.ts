/**
 * hookInstaller.test.ts — Unit tests for hook installation logic.
 *
 * Uses vitest with mocked 'fs', 'fs/promises', 'os', and 'electron' modules so
 * the tests run without a real Electron environment.
 *
 * Run with:  npx vitest run src/main/hookInstaller.test.ts
 */

import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock 'electron' before importing the module under test ───────────────────
vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/fake/app',
  },
  Notification: {
    isSupported: () => false,
    prototype: {},
  },
}));

// ── Mock 'fs' (sync — used only by getCurrentHookVersion and uninstallHooks) ─
const { mockFs } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn<(path: string) => boolean>(),
    readFileSync: vi.fn<(path: string, enc: string) => string>(),
    rmSync: vi.fn<(path: string, opts: { force?: boolean }) => void>(),
  },
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

// ── Mock 'fs/promises' (async — used by install/read/write helpers) ───────────
const { mockFsPromises } = vi.hoisted(() => ({
  mockFsPromises: {
    access: vi.fn<(path: string) => Promise<void>>(),
    mkdir: vi.fn<(path: string, opts: { recursive?: boolean }) => Promise<void>>(),
    copyFile: vi.fn<(src: string, dest: string) => Promise<void>>(),
    chmod: vi.fn<(path: string, mode: number) => Promise<void>>(),
    writeFile: vi.fn<(path: string, data: string, enc: string) => Promise<void>>(),
    readFile: vi.fn<(path: string, enc: string) => Promise<string>>(),
  },
}));

vi.mock('fs/promises', () => ({
  default: mockFsPromises,
  ...mockFsPromises,
}));

// ── Import after mocks are set up ─────────────────────────────────────────────
import {
  CURRENT_HOOK_VERSION,
  getCurrentHookVersion,
  hooksAreUpToDate,
  installHooks,
  invalidateHookVersionCache,
  uninstallHooks,
} from './hookInstaller';

// ── Config mock ───────────────────────────────────────────────────────────────
vi.mock('./config', () => ({
  getConfigValue: vi.fn((key: string) => {
    if (key === 'autoInstallHooks') return true;
    return undefined;
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const claudeHooksDir = path.join(os.homedir(), '.claude', 'hooks');
const markerPath = path.join(claudeHooksDir, '.agent-ide-version');

function resetMocks() {
  vi.resetAllMocks();
  invalidateHookVersionCache();
  // Default: source scripts exist (access resolves), marker does not (readFile throws)
  mockFs.existsSync.mockImplementation((p: string) => {
    if (typeof p === 'string' && p.includes('assets')) return true;
    return false;
  });
  mockFs.readFileSync.mockReturnValue('');
  mockFsPromises.access.mockImplementation((p: string) => {
    if (typeof p === 'string' && p.includes('assets')) return Promise.resolve();
    return Promise.reject(new Error('ENOENT'));
  });
  mockFsPromises.mkdir.mockResolvedValue(undefined);
  mockFsPromises.copyFile.mockResolvedValue(undefined);
  mockFsPromises.chmod.mockResolvedValue(undefined);
  mockFsPromises.writeFile.mockResolvedValue(undefined);
  mockFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));
}

async function setAutoInstallHooks(value: boolean): Promise<void> {
  const { getConfigValue } = await import('./config');
  vi.mocked(getConfigValue).mockReturnValue(value as never);
}

// ─── installHooks() skip tests ────────────────────────────────────────────────

function registerInstallHooksSkipTests(): void {
  it('skips when autoInstallHooks is false', async () => {
    await setAutoInstallHooks(false);

    const result = await installHooks();

    expect(result.installed).toBe(false);
    expect(result.skippedReason).toMatch(/disabled/);
    expect(mockFsPromises.mkdir).not.toHaveBeenCalled();
  });

  it('skips when version marker matches current version', async () => {
    await setAutoInstallHooks(true);
    // getCurrentHookVersion() uses fs.readFileSync — runs before we stub it
    const currentVersion = getCurrentHookVersion();
    // Marker exists and contains current version
    mockFsPromises.readFile.mockResolvedValue(currentVersion);

    const result = await installHooks();

    expect(result.installed).toBe(false);
    expect(result.skippedReason).toMatch(currentVersion);
    expect(mockFsPromises.copyFile).not.toHaveBeenCalled();
  });
}

// ─── installHooks() install tests ─────────────────────────────────────────────

function registerInstallHooksInstallTests(): void {
  it('performs a first install when no marker exists', async () => {
    await setAutoInstallHooks(true);
    const currentVersion = getCurrentHookVersion();
    // marker readFile throws (ENOENT) — already default in resetMocks

    const result = await installHooks();

    expect(result.installed).toBe(true);
    expect(result.firstInstall).toBe(true);
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(claudeHooksDir, { recursive: true });
    expect(mockFsPromises.copyFile).toHaveBeenCalled();
    expect(mockFsPromises.writeFile).toHaveBeenCalledWith(markerPath, currentVersion, 'utf8');
  });

  it('updates existing install when version is stale', async () => {
    await setAutoInstallHooks(true);
    // Marker exists with old version
    mockFsPromises.readFile.mockResolvedValue('0.0.1');

    const result = await installHooks();

    expect(result.installed).toBe(true);
    expect(result.firstInstall).toBe(false);
    expect(mockFsPromises.copyFile).toHaveBeenCalled();
  });
}

// ─── installHooks() missing-source test ───────────────────────────────────────

function registerInstallHooksMissingSourceTest(): void {
  it('skips individual script if source file is missing', async () => {
    await setAutoInstallHooks(true);
    // All access() calls fail — no source scripts found
    mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));

    const result = await installHooks();

    expect(result.installed).toBe(true);
    expect(mockFsPromises.copyFile).not.toHaveBeenCalled();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CURRENT_HOOK_VERSION', () => {
  it('is the static sentinel value "auto"', () => {
    expect(CURRENT_HOOK_VERSION).toBe('auto');
  });

  it('getCurrentHookVersion() returns a 16-char hex hash', () => {
    expect(getCurrentHookVersion()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('installHooks()', () => {
  beforeEach(resetMocks);
  afterEach(() => vi.restoreAllMocks());
  registerInstallHooksSkipTests();
  registerInstallHooksInstallTests();
  registerInstallHooksMissingSourceTest();
});

describe('hooksAreUpToDate()', () => {
  beforeEach(resetMocks);

  it('returns true when marker matches current version', async () => {
    mockFsPromises.readFile.mockResolvedValue(getCurrentHookVersion());

    expect(await hooksAreUpToDate()).toBe(true);
  });

  it('returns false when marker has old version', async () => {
    mockFsPromises.readFile.mockResolvedValue('0.0.1');

    expect(await hooksAreUpToDate()).toBe(false);
  });

  it('returns false when marker does not exist', async () => {
    mockFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));

    expect(await hooksAreUpToDate()).toBe(false);
  });
});

describe('uninstallHooks()', () => {
  beforeEach(resetMocks);

  it('removes all hook files and the version marker', () => {
    mockFs.existsSync.mockReturnValue(true);

    uninstallHooks();

    expect(mockFs.rmSync).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removedPaths = vi.mocked(mockFs.rmSync).mock.calls.map((args: any) => args[0] as string);
    expect(removedPaths.some((p) => p.endsWith('.agent-ide-version'))).toBe(true);
  });

  it('does not throw if files do not exist', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(() => uninstallHooks()).not.toThrow();
    expect(mockFs.rmSync).not.toHaveBeenCalled();
  });
});
