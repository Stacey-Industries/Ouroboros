/**
 * codemodeStartup.test.ts — Wave 53l Phase A.
 *
 * Smoke tests for the user-level CodeMode lifecycle hooks. Mocks
 * `codemodeManager` (the underlying enable/disable mechanics, already
 * tested by `codemodeManager.test.ts`) and `../config` so the gate logic
 * and eligibility filter can be exercised without real file I/O.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ getConfigValue: vi.fn() }));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../internalMcp/internalMcpPortRegistry', () => ({
  getInternalMcpUrl: vi.fn(),
}));
vi.mock('./codemodeManager', () => ({
  enableCodeMode: vi.fn(),
  disableCodeMode: vi.fn(),
  getMcpServers: vi.fn(),
  isCodeModeEnabled: vi.fn(),
}));

import { getConfigValue } from '../config';
import { getInternalMcpUrl } from '../internalMcp/internalMcpPortRegistry';
import {
  disableCodeMode,
  enableCodeMode,
  getMcpServers,
  isCodeModeEnabled,
} from './codemodeManager';
import { disableCodeModeUserLevel, enableCodeModeUserLevel } from './codemodeStartup';

const cfg = getConfigValue as ReturnType<typeof vi.fn>;
const enabledFn = isCodeModeEnabled as ReturnType<typeof vi.fn>;
const enableFn = enableCodeMode as ReturnType<typeof vi.fn>;
const disableFn = disableCodeMode as ReturnType<typeof vi.fn>;
const serversFn = getMcpServers as ReturnType<typeof vi.fn>;
const liveUrlFn = getInternalMcpUrl as ReturnType<typeof vi.fn>;

function setConfig(map: Record<string, unknown>): void {
  cfg.mockImplementation((key: string) => map[key as keyof typeof map]);
}

beforeEach(() => {
  vi.clearAllMocks();
  enabledFn.mockReturnValue(false);
  enableFn.mockResolvedValue({ success: true });
  disableFn.mockResolvedValue({ success: true });
  serversFn.mockResolvedValue([]);
  liveUrlFn.mockReturnValue('http://127.0.0.1:51199/');
});

describe('enableCodeModeUserLevel — gate', () => {
  it('returns success:false when codemode.enabled is missing', async () => {
    setConfig({});
    const result = await enableCodeModeUserLevel();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/codemode\.enabled is false/);
    expect(enableFn).not.toHaveBeenCalled();
  });

  it('returns success:false when codemode.enabled is false', async () => {
    setConfig({ codemode: { enabled: false } });
    const result = await enableCodeModeUserLevel();
    expect(result.success).toBe(false);
    expect(enableFn).not.toHaveBeenCalled();
  });

  it('returns success:true and skips when already enabled (idempotent)', async () => {
    setConfig({ codemode: { enabled: true } });
    enabledFn.mockReturnValue(true);
    const result = await enableCodeModeUserLevel();
    expect(result.success).toBe(true);
    expect(enableFn).not.toHaveBeenCalled();
  });
});

describe('enableCodeModeUserLevel — eligibility filter', () => {
  it('multiplexes stdio-capable servers, skips HTTP-only', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh-bin' } },
      { name: 'sentry', enabled: true, scope: 'global', config: { url: 'https://x' } },
      { name: 'context7', enabled: true, scope: 'global', config: { url: 'https://y' } },
      {
        name: 'ouroboros',
        enabled: true,
        scope: 'project',
        config: { command: 'node', args: ['/path/internalMcpStdioTransport.js', '51199'] },
      },
    ]);
    await enableCodeModeUserLevel({ projectRoot: '/proj' });
    expect(enableFn).toHaveBeenCalledTimes(1);
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).toEqual(expect.arrayContaining(['github', 'ouroboros']));
    expect(names).not.toContain('sentry');
    expect(names).not.toContain('context7');
  });

  it('respects codemode.excludeFromMultiplex', async () => {
    setConfig({ codemode: { enabled: true, excludeFromMultiplex: ['github'] } });
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh-bin' } },
      { name: 'stripe', enabled: true, scope: 'global', config: { command: 'stripe-bin' } },
    ]);
    await enableCodeModeUserLevel();
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).not.toContain('github');
    expect(names).toContain('stripe');
  });

  it('skips disabled servers', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh-bin' } },
      { name: 'inactive', enabled: false, scope: 'global', config: { command: 'na' } },
    ]);
    await enableCodeModeUserLevel();
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).toContain('github');
    expect(names).not.toContain('inactive');
  });

  it('drops ouroboros when bridge port differs from live internalMcp port', async () => {
    setConfig({ codemode: { enabled: true } });
    liveUrlFn.mockReturnValue('http://127.0.0.1:51199/');
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh' } },
      {
        name: 'ouroboros',
        enabled: true,
        scope: 'project',
        config: { command: 'node', args: ['/path/internalMcpStdioTransport.js', '51156'] },
      },
    ]);
    await enableCodeModeUserLevel({ projectRoot: '/proj' });
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).toContain('github');
    expect(names).not.toContain('ouroboros');
  });

  it('drops ouroboros when internalMcp is not running this session', async () => {
    setConfig({ codemode: { enabled: true } });
    liveUrlFn.mockReturnValue(null);
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh' } },
      {
        name: 'ouroboros',
        enabled: true,
        scope: 'project',
        config: { command: 'node', args: ['/path/internalMcpStdioTransport.js', '51156'] },
      },
    ]);
    await enableCodeModeUserLevel({ projectRoot: '/proj' });
    const names = enableFn.mock.calls[0][0] as string[];
    expect(names).toContain('github');
    expect(names).not.toContain('ouroboros');
  });

  it('returns success:false when no eligible servers exist', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([
      { name: 'sentry', enabled: true, scope: 'global', config: { url: 'https://x' } },
    ]);
    const result = await enableCodeModeUserLevel();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no eligible servers/);
    expect(enableFn).not.toHaveBeenCalled();
  });
});

describe('enableCodeModeUserLevel — passthrough to enableCodeMode', () => {
  it('passes scope=global and forwards projectRoot', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh' } },
    ]);
    await enableCodeModeUserLevel({ projectRoot: '/some/proj' });
    const call = enableFn.mock.calls[0];
    expect(call[1]).toBe('global');
    expect(call[2]).toBe('/some/proj');
  });

  it('forwards enableCodeMode failure to caller', async () => {
    setConfig({ codemode: { enabled: true } });
    serversFn.mockResolvedValue([
      { name: 'github', enabled: true, scope: 'global', config: { command: 'gh' } },
    ]);
    enableFn.mockResolvedValue({ success: false, error: 'something broke' });
    const result = await enableCodeModeUserLevel();
    expect(result.success).toBe(false);
    expect(result.error).toBe('something broke');
  });
});

describe('disableCodeModeUserLevel', () => {
  it('does nothing when codemode is not enabled', async () => {
    enabledFn.mockReturnValue(false);
    await disableCodeModeUserLevel();
    expect(disableFn).not.toHaveBeenCalled();
  });

  it('calls disableCodeMode when active', async () => {
    enabledFn.mockReturnValue(true);
    await disableCodeModeUserLevel();
    expect(disableFn).toHaveBeenCalledTimes(1);
  });

  it('swallows disable errors so app shutdown is not blocked', async () => {
    enabledFn.mockReturnValue(true);
    disableFn.mockRejectedValue(new Error('mid-write'));
    await expect(disableCodeModeUserLevel()).resolves.toBeUndefined();
  });

  it('logs but tolerates disable returning success:false', async () => {
    enabledFn.mockReturnValue(true);
    disableFn.mockResolvedValue({ success: false, error: 'not enabled' });
    await expect(disableCodeModeUserLevel()).resolves.toBeUndefined();
  });
});
