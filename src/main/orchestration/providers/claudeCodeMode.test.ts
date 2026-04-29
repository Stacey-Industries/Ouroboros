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
    // Wave 53k Phase B‴: claudeCodeMode now filters by isStdioCapable (config.command).
    // All fixture servers must have a command field to be eligible for proxy multiplex;
    // url-only entries would be filtered out as HTTP-only (correct behavior).
    { name: 'sentry', enabled: true, scope: 'global', config: { command: 'sentry-bin' } },
    { name: 'github', enabled: true, scope: 'global', config: { command: 'gh-bin' } },
    {
      name: 'ouroboros',
      enabled: true,
      scope: 'project',
      config: { command: 'node', args: ['stdio.js', '0'] },
    },
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
    setConfig({ codemode: { enabled: true } });
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).not.toContain('ouroboros');
    expect(names).toEqual(expect.arrayContaining(['sentry', 'github']));
  });

  it('includes ouroboros by default when transport === stdio (Wave 53l Phase B)', async () => {
    setConfig({
      codemode: { enabled: true },
      internalMcp: { transport: 'stdio' },
    });
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).toContain('ouroboros');
  });

  it('omits ouroboros when excludeFromMultiplex contains it', async () => {
    setConfig({
      codemode: { enabled: true, excludeFromMultiplex: ['ouroboros'] },
      internalMcp: { transport: 'stdio' },
    });
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).not.toContain('ouroboros');
  });

  // Wave 53k Phase B‴: HTTP-only upstreams (url, no command) are not multiplexed
  // because mcpClient.ts is stdio-only. Including them caused the proxy to hang
  // 30s per upstream on connectUpstream before failing.
  it('skips HTTP-only servers (url, no command) from the proxied set', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([
      { name: 'sentry-http', enabled: true, scope: 'global', config: { url: 'https://x/mcp' } },
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh-bin' } },
      { name: 'context7', enabled: true, scope: 'global', config: { url: 'https://y/mcp' } },
    ]);
    await acquireCodeModeForLaunch('/proj');
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).not.toContain('sentry-http');
    expect(names).not.toContain('context7');
    expect(names).toContain('github');
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
