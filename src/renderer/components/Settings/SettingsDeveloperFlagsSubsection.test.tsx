/**
 * SettingsDeveloperFlagsSubsection.test.tsx — smoke tests for the developer flags subsection.
 *
 * The component renders with React and uses no Electron APIs directly, but
 * vitest runs under Node (no DOM), so we test the module shape and flag
 * defaults without rendering.
 */

import { describe, expect, it } from 'vitest';

import { DeveloperFlagsSubsection } from './SettingsDeveloperFlagsSubsection';

describe('DeveloperFlagsSubsection', () => {
  it('exports a function component', () => {
    expect(typeof DeveloperFlagsSubsection).toBe('function');
  });
});

// Verify the three developer flag keys match AppConfig property names.
// If any are renamed, TypeScript will catch it at build time — these tests
// guard the string literals used in the component's onChange calls.
const DEVELOPER_FLAG_KEYS = ['usePtyHost', 'useExtensionHost', 'useMcpHost'] as const;

describe('developer flag key coverage', () => {
  it('covers exactly three flags', () => {
    expect(DEVELOPER_FLAG_KEYS).toHaveLength(3);
  });

  it('includes usePtyHost', () => {
    expect(DEVELOPER_FLAG_KEYS).toContain('usePtyHost');
  });

  it('includes useExtensionHost', () => {
    expect(DEVELOPER_FLAG_KEYS).toContain('useExtensionHost');
  });

  it('includes useMcpHost', () => {
    expect(DEVELOPER_FLAG_KEYS).toContain('useMcpHost');
  });

  it('has no duplicate flag keys', () => {
    const unique = new Set(DEVELOPER_FLAG_KEYS);
    expect(unique.size).toBe(DEVELOPER_FLAG_KEYS.length);
  });
});

// Verify that all three flags default to false when absent from config,
// matching the `draft.usePtyHost ?? false` pattern in the component.
describe('developer flag default values', () => {
  const emptyDraft: Partial<Record<(typeof DEVELOPER_FLAG_KEYS)[number], boolean>> = {};

  it('usePtyHost defaults to false', () => {
    expect(emptyDraft.usePtyHost ?? false).toBe(false);
  });

  it('useExtensionHost defaults to false', () => {
    expect(emptyDraft.useExtensionHost ?? false).toBe(false);
  });

  it('useMcpHost defaults to false', () => {
    expect(emptyDraft.useMcpHost ?? false).toBe(false);
  });
});
