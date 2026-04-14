/**
 * ptyCwdResolver.test.ts — Unit tests for the OS-aware PTY cwd resolver.
 *
 * Mocks node:fs/promises and node:child_process so tests run without a real
 * process or file system. Platform is overridden via Object.defineProperty.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReadlink = vi.fn<() => Promise<string>>();
const mockExecFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  default: { readlink: (...args: unknown[]) => mockReadlink(...(args as [])) },
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => {
    // Return our mock execFile when promisify is called on execFile
    void fn;
    return mockExecFile;
  },
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function setPlatform(platform: string): string {
  const orig = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return orig;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolvePtyCwd', () => {
  let origPlatform: string;

  beforeEach(() => {
    origPlatform = process.platform;
    vi.resetModules();
    mockReadlink.mockReset();
    mockExecFile.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  });

  it('linux: readlink success returns resolved path', async () => {
    setPlatform('linux');
    mockReadlink.mockResolvedValue('/home/user/projects/foo');
    const { resolvePtyCwd } = await import('./ptyCwdResolver');
    const result = await resolvePtyCwd(12345, '/fallback');
    expect(result).toBe('/home/user/projects/foo');
    expect(mockReadlink).toHaveBeenCalledWith('/proc/12345/cwd');
  });

  it('linux: readlink throws returns fallback', async () => {
    setPlatform('linux');
    mockReadlink.mockRejectedValue(new Error('ENOENT'));
    const { resolvePtyCwd } = await import('./ptyCwdResolver');
    const result = await resolvePtyCwd(12345, '/fallback');
    expect(result).toBe('/fallback');
  });

  it('darwin: lsof success parses n-prefixed line correctly', async () => {
    setPlatform('darwin');
    mockExecFile.mockResolvedValue({ stdout: 'p12345\nfcwd\nn/Users/someone/projects/foo\n' });
    const { resolvePtyCwd } = await import('./ptyCwdResolver');
    const result = await resolvePtyCwd(12345, '/fallback');
    expect(result).toBe('/Users/someone/projects/foo');
  });

  it('darwin: lsof fails returns fallback', async () => {
    setPlatform('darwin');
    mockExecFile.mockRejectedValue(new Error('lsof not found'));
    const { resolvePtyCwd } = await import('./ptyCwdResolver');
    const result = await resolvePtyCwd(12345, '/fallback');
    expect(result).toBe('/fallback');
  });

  it('win32: returns fallback and logs once', async () => {
    setPlatform('win32');
    const log = (await import('./logger')).default;
    const spy = vi.spyOn(log, 'info');
    const { resolvePtyCwd } = await import('./ptyCwdResolver');
    const result = await resolvePtyCwd(99, 'C:\\Users\\dev\\project');
    expect(result).toBe('C:\\Users\\dev\\project');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Windows cwd resolution unsupported'));
  });

  it('unknown platform: returns fallback', async () => {
    setPlatform('freebsd');
    const { resolvePtyCwd } = await import('./ptyCwdResolver');
    const result = await resolvePtyCwd(42, '/fallback');
    expect(result).toBe('/fallback');
  });
});
