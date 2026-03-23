/**
 * hookInstaller.test.ts — Unit tests for hook installation logic.
 *
 * Uses vitest with mocked 'fs', 'os', and 'electron' modules so the
 * tests run without a real Electron environment.
 *
 * Run with:  npx vitest run src/main/hookInstaller.test.ts
 * (add vitest to devDependencies if not present:  npm i -D vitest)
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

// ── Mock 'fs' ─────────────────────────────────────────────────────────────────
const { mockFs } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn<[string], boolean>(),
    mkdirSync: vi.fn<[string, { recursive?: boolean }], void>(),
    copyFileSync: vi.fn<[string, string], void>(),
    chmodSync: vi.fn<[string, number], void>(),
    writeFileSync: vi.fn<[string, string, string], void>(),
    readFileSync: vi.fn<[string, string], string>(),
    rmSync: vi.fn<[string, { force?: boolean }], void>(),
  },
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

// ── Import after mocks are set up ─────────────────────────────────────────────
import {
  CURRENT_HOOK_VERSION,
  hooksAreUpToDate,
  installHooks,
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
  // Default: source scripts exist
  mockFs.existsSync.mockImplementation((p: string) => {
    if (typeof p === 'string' && p.includes('assets')) return true;
    return false;
  });
  mockFs.readFileSync.mockReturnValue('');
}

async function setAutoInstallHooks(value: boolean): Promise<void> {
  const { getConfigValue } = await import('./config');
  vi.mocked(getConfigValue).mockReturnValue(value as never);
}

function registerInstallHooksSkipTests(): void {
  it('skips when autoInstallHooks is false', async () => {
    await setAutoInstallHooks(false);

    const result = await installHooks();

    expect(result.installed).toBe(false);
    expect(result.skippedReason).toMatch(/disabled/);
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  it('skips when version marker matches current version', async () => {
    await setAutoInstallHooks(true);
    mockFs.existsSync.mockImplementation(
      (p: string) => p === markerPath || (typeof p === 'string' && p.includes('assets')),
    );
    mockFs.readFileSync.mockReturnValue(CURRENT_HOOK_VERSION);

    const result = await installHooks();

    expect(result.installed).toBe(false);
    expect(result.skippedReason).toMatch(CURRENT_HOOK_VERSION);
    expect(mockFs.copyFileSync).not.toHaveBeenCalled();
  });
}

function registerInstallHooksInstallTests(): void {
  it('performs a first install when no marker exists', async () => {
    await setAutoInstallHooks(true);
    mockFs.existsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('assets'),
    );
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = await installHooks();

    expect(result.installed).toBe(true);
    expect(result.firstInstall).toBe(true);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(claudeHooksDir, { recursive: true });
    expect(mockFs.copyFileSync).toHaveBeenCalled();
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(markerPath, CURRENT_HOOK_VERSION, 'utf8');
  });

  it('updates existing install when version is stale', async () => {
    await setAutoInstallHooks(true);
    mockFs.existsSync.mockImplementation(
      (p: string) => p === markerPath || (typeof p === 'string' && p.includes('assets')),
    );
    mockFs.readFileSync.mockReturnValue('0.0.1');

    const result = await installHooks();

    expect(result.installed).toBe(true);
    expect(result.firstInstall).toBe(false);
    expect(mockFs.copyFileSync).toHaveBeenCalled();
  });
}

function registerInstallHooksMissingSourceTest(): void {
  it('skips individual script if source file is missing', async () => {
    await setAutoInstallHooks(true);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = await installHooks();

    expect(result.installed).toBe(true);
    expect(mockFs.copyFileSync).not.toHaveBeenCalled();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CURRENT_HOOK_VERSION', () => {
  it('is a semver string', () => {
    expect(CURRENT_HOOK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
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

  it('returns true when marker matches current version', () => {
    mockFs.existsSync.mockImplementation((p: string) => p === markerPath);
    mockFs.readFileSync.mockReturnValue(CURRENT_HOOK_VERSION);

    expect(hooksAreUpToDate()).toBe(true);
  });

  it('returns false when marker has old version', () => {
    mockFs.existsSync.mockImplementation((p: string) => p === markerPath);
    mockFs.readFileSync.mockReturnValue('0.0.1');

    expect(hooksAreUpToDate()).toBe(false);
  });

  it('returns false when marker does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(hooksAreUpToDate()).toBe(false);
  });
});

describe('uninstallHooks()', () => {
  beforeEach(resetMocks);

  it('removes all hook files and the version marker', () => {
    mockFs.existsSync.mockReturnValue(true);

    uninstallHooks();

    // Should have called rmSync for each hook file + the marker
    expect(mockFs.rmSync).toHaveBeenCalled();
    const removedPaths = vi.mocked(mockFs.rmSync).mock.calls.map(([p]) => p as string);
    expect(removedPaths.some((p) => p.endsWith('.agent-ide-version'))).toBe(true);
  });

  it('does not throw if files do not exist', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(() => uninstallHooks()).not.toThrow();
    expect(mockFs.rmSync).not.toHaveBeenCalled();
  });
});
