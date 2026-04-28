/**
 * claudeCodeMode.test.ts — Wave 51 Phase B launch-wiring smoke tests.
 *
 * Covers the config-gated enable/disable lifecycle including:
 *   - skip when `codemode.enabled` is false
 *   - skip (and join) when CodeMode is already enabled in this process
 *   - graceful downgrade when codemodeManager.enableCodeMode rejects
 *   - ouroboros inclusion gated on transport === 'stdio' AND routeInternalMcp
 *   - disable runs only when this caller owns the lifecycle
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../../codemode/codemodeManager', () => ({
  enableCodeMode: vi.fn(),
  disableCodeMode: vi.fn(),
  getMcpServers: vi.fn(),
  isCodeModeEnabled: vi.fn(),
}));

vi.mock('../../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  disableCodeMode,
  enableCodeMode,
  getMcpServers,
  isCodeModeEnabled,
} from '../../codemode/codemodeManager';
import { getConfigValue } from '../../config';
import {
  acquireCodeModeForLaunch,
  isCodeModeLaunchEnabled,
  releaseCodeModeForLaunch,
} from './claudeCodeMode';

const cfg = getConfigValue as ReturnType<typeof vi.fn>;
const isEnabled = isCodeModeEnabled as ReturnType<typeof vi.fn>;
const enableFn = enableCodeMode as ReturnType<typeof vi.fn>;
const disableFn = disableCodeMode as ReturnType<typeof vi.fn>;
const serversFn = getMcpServers as ReturnType<typeof vi.fn>;

function setConfig(map: Record<string, unknown>): void {
  cfg.mockImplementation((key: string) => map[key as keyof typeof map]);
}

beforeEach(() => {
  vi.clearAllMocks();
  isEnabled.mockReturnValue(false);
  enableFn.mockResolvedValue({ success: true });
  disableFn.mockResolvedValue({ success: true });
  serversFn.mockResolvedValue([
    { name: 'sentry', enabled: true, scope: 'global' },
    { name: 'github', enabled: true, scope: 'global' },
    { name: 'ouroboros', enabled: true, scope: 'project' },
  ]);
});

describe('isCodeModeLaunchEnabled', () => {
  it('is false when config flag absent', () => {
    setConfig({});
    expect(isCodeModeLaunchEnabled()).toBe(false);
  });
  it('is true when codemode.enabled', () => {
    setConfig({ codemode: { enabled: true } });
    expect(isCodeModeLaunchEnabled()).toBe(true);
  });
});

describe('acquireCodeModeForLaunch', () => {
  it('returns no-op handle when flag is off', async () => {
    setConfig({});
    const h = await acquireCodeModeForLaunch('/proj');
    expect(h.ownsLifecycle).toBe(false);
    expect(enableFn).not.toHaveBeenCalled();
  });

  it('returns no-op handle and skips enable when already enabled', async () => {
    setConfig({ codemode: { enabled: true } });
    isEnabled.mockReturnValue(true);
    const h = await acquireCodeModeForLaunch('/proj');
    expect(h.ownsLifecycle).toBe(false);
    expect(enableFn).not.toHaveBeenCalled();
  });

  it('omits ouroboros from proxied set when transport !== stdio', async () => {
    setConfig({ codemode: { enabled: true, routeInternalMcp: true } });
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).not.toContain('ouroboros');
    expect(names).toEqual(expect.arrayContaining(['sentry', 'github']));
  });

  it('includes ouroboros when transport === stdio AND routeInternalMcp', async () => {
    setConfig({
      codemode: { enabled: true, routeInternalMcp: true },
      internalMcp: { transport: 'stdio' },
    });
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).toContain('ouroboros');
  });

  it('omits ouroboros when routeInternalMcp is false even with stdio transport', async () => {
    setConfig({
      codemode: { enabled: true, routeInternalMcp: false },
      internalMcp: { transport: 'stdio' },
    });
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).not.toContain('ouroboros');
  });

  it('downgrades gracefully when enableCodeMode reports failure', async () => {
    setConfig({ codemode: { enabled: true } });
    enableFn.mockResolvedValue({ success: false, error: 'boom' });
    const h = await acquireCodeModeForLaunch('/proj');
    expect(h.ownsLifecycle).toBe(false);
  });

  it('downgrades gracefully when enableCodeMode throws', async () => {
    setConfig({ codemode: { enabled: true } });
    enableFn.mockRejectedValue(new Error('settings file locked'));
    const h = await acquireCodeModeForLaunch('/proj');
    expect(h.ownsLifecycle).toBe(false);
  });

  it('reports ownership when enable succeeds', async () => {
    setConfig({ codemode: { enabled: true } });
    const h = await acquireCodeModeForLaunch('/proj');
    expect(h.ownsLifecycle).toBe(true);
  });

  it('uses scope=global when projectRoot is undefined', async () => {
    setConfig({ codemode: { enabled: true } });
    await acquireCodeModeForLaunch(undefined);
    expect(enableFn.mock.calls[0][1]).toBe('global');
  });

  it('skips enable when there are no upstream servers to proxy', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([]);
    const h = await acquireCodeModeForLaunch('/proj');
    expect(h.ownsLifecycle).toBe(false);
    expect(enableFn).not.toHaveBeenCalled();
  });
});

describe('releaseCodeModeForLaunch', () => {
  it('does nothing when caller does not own lifecycle', async () => {
    await releaseCodeModeForLaunch({ ownsLifecycle: false });
    expect(disableFn).not.toHaveBeenCalled();
  });

  it('disables when caller owns lifecycle', async () => {
    await releaseCodeModeForLaunch({ ownsLifecycle: true });
    expect(disableFn).toHaveBeenCalledTimes(1);
  });

  it('swallows disable errors', async () => {
    disableFn.mockRejectedValue(new Error('mid-write'));
    await expect(releaseCodeModeForLaunch({ ownsLifecycle: true })).resolves.toBeUndefined();
  });

  it('swallows disable returning success=false', async () => {
    disableFn.mockResolvedValue({ success: false, error: 'not enabled' });
    await expect(releaseCodeModeForLaunch({ ownsLifecycle: true })).resolves.toBeUndefined();
  });
});
