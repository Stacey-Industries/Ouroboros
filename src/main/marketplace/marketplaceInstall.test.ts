/**
 * marketplaceInstall.test.ts — per-kind install path tests.
 *
 * config module is mocked so no electron-store is touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron-store config helpers.
const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

import { installBundle } from './marketplaceInstall';
import type { BundleContent } from './types';

// ── Theme install ─────────────────────────────────────────────────────────────

describe('installBundle — theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue({ customTokens: { '--existing': '#111' } });
  });

  it('merges new tokens into existing customTokens', () => {
    const bundle: BundleContent = {
      id: 'my-theme',
      kind: 'theme',
      payload: { '--surface-base': '#000', '--text-primary': '#fff' },
    };

    const result = installBundle(bundle);

    expect(result.success).toBe(true);
    expect(mockSetConfigValue).toHaveBeenCalledOnce();
    const [key, value] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('theming');
    expect((value.customTokens as Record<string, string>)['--existing']).toBe('#111');
    expect((value.customTokens as Record<string, string>)['--surface-base']).toBe('#000');
  });

  it('works when customTokens is not yet set', () => {
    mockGetConfigValue.mockReturnValue({});
    const bundle: BundleContent = {
      id: 'my-theme',
      kind: 'theme',
      payload: { '--accent': 'blue' },
    };

    const result = installBundle(bundle);
    expect(result.success).toBe(true);
  });

  it('returns error when payload is not an object', () => {
    const bundle: BundleContent = { id: 'bad', kind: 'theme', payload: 'not-an-object' };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/object/);
  });
});

// ── Prompt install ────────────────────────────────────────────────────────────

describe('installBundle — prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue({});
  });

  it('writes the prompt string to ecosystem.systemPrompt', () => {
    const bundle: BundleContent = {
      id: 'my-prompt',
      kind: 'prompt',
      payload: 'You are a helpful assistant.',
    };

    const result = installBundle(bundle);
    expect(result.success).toBe(true);
    const [key, value] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('ecosystem');
    expect(value.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('preserves existing ecosystem keys alongside systemPrompt', () => {
    mockGetConfigValue.mockReturnValue({ lastSeenSnapshot: { cliVersion: '1.2.3' } });
    const bundle: BundleContent = { id: 'p', kind: 'prompt', payload: 'Hi.' };
    installBundle(bundle);
    const [, value] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    expect((value.lastSeenSnapshot as Record<string, string>).cliVersion).toBe('1.2.3');
  });

  it('returns error when payload is not a string', () => {
    const bundle: BundleContent = { id: 'bad-prompt', kind: 'prompt', payload: { text: 'hi' } };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/string/);
  });
});

// ── Theme key allowlist ───────────────────────────────────────────────────────

describe('installBundle — theme key allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue({});
  });

  it('accepts valid CSS custom property keys', () => {
    const bundle: BundleContent = {
      id: 'valid-theme',
      kind: 'theme',
      payload: { '--surface-base': '#000', '--text-primary-muted': '#aaa' },
    };
    const result = installBundle(bundle);
    expect(result.success).toBe(true);
  });

  it('rejects keys with uppercase letters', () => {
    const bundle: BundleContent = {
      id: 'bad-theme',
      kind: 'theme',
      payload: { '--Surface-Base': '#000' },
    };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toBe('theme-key-invalid');
    expect(result.invalidKeys).toContain('--Surface-Base');
  });

  it('rejects keys that do not start with "--"', () => {
    const bundle: BundleContent = {
      id: 'bad-theme',
      kind: 'theme',
      payload: { 'foo--bar': '#000' },
    };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toBe('theme-key-invalid');
    expect(result.invalidKeys).toContain('foo--bar');
  });

  it('rejects keys that contain uppercase or do not match CSS custom property format', () => {
    const bundle: BundleContent = {
      id: 'bad-theme',
      kind: 'theme',
      // Object.assign used so the test value is a real own-property.
      payload: Object.assign({}, { 'DANGER-key': 'evil' }),
    };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toBe('theme-key-invalid');
    expect(result.invalidKeys).toContain('DANGER-key');
  });

  it('reports all invalid keys, not just the first', () => {
    const bundle: BundleContent = {
      id: 'multi-bad',
      kind: 'theme',
      payload: { 'foo--bar': '#1', 'BAD': '#2', '--ok': '#3' },
    };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.invalidKeys).toHaveLength(2);
    expect(result.invalidKeys).toContain('foo--bar');
    expect(result.invalidKeys).toContain('BAD');
  });
});

// ── Rules-and-skills stub ─────────────────────────────────────────────────────

describe('installBundle — rules-and-skills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rules-install-disabled when flag is off (default)', () => {
    mockGetConfigValue.mockReturnValue({ rulesAndSkillsInstallEnabled: false });
    const bundle: BundleContent = { id: 'rules', kind: 'rules-and-skills', payload: [] };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toBe('rules-install-disabled');
  });

  it('returns rules-install-disabled when ecosystem config is null', () => {
    mockGetConfigValue.mockReturnValue(null);
    const bundle: BundleContent = { id: 'rules', kind: 'rules-and-skills', payload: [] };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toBe('rules-install-disabled');
  });

  it('returns rules-install-not-wired when flag is explicitly enabled', () => {
    mockGetConfigValue.mockReturnValue({ rulesAndSkillsInstallEnabled: true });
    const bundle: BundleContent = { id: 'rules', kind: 'rules-and-skills', payload: [] };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toBe('rules-install-not-wired');
  });
});

// ── Error resilience ──────────────────────────────────────────────────────────

describe('installBundle — error resilience', () => {
  it('returns error when config throws instead of propagating', () => {
    mockGetConfigValue.mockImplementation(() => { throw new Error('store locked'); });
    const bundle: BundleContent = { id: 'x', kind: 'theme', payload: {} };
    const result = installBundle(bundle);
    expect(result.success).toBe(false);
    expect(result.error).toContain('store locked');
  });
});
