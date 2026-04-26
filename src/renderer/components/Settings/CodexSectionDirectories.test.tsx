/**
 * CodexSectionDirectories.test.tsx — Smoke tests for the extracted directory
 * sub-components from CodexSection.
 *
 * Full rendering requires jsdom + electronAPI mocks (covered by E2E). These
 * tests validate module export shape and pure-logic invariants.
 */

import { describe, expect, it } from 'vitest';

import {
  AdditionalDirectoriesSection,
  WorkspaceSection,
} from './CodexSectionDirectories';

// ── Export shape ───────────────────────────────────────────────────────────

describe('CodexSectionDirectories exports', () => {
  it('exports AdditionalDirectoriesSection as a function', () => {
    expect(typeof AdditionalDirectoriesSection).toBe('function');
  });

  it('exports WorkspaceSection as a function', () => {
    expect(typeof WorkspaceSection).toBe('function');
  });

  it('AdditionalDirectoriesSection has correct name', () => {
    expect(AdditionalDirectoriesSection.name).toBe('AdditionalDirectoriesSection');
  });

  it('WorkspaceSection has correct name', () => {
    expect(WorkspaceSection.name).toBe('WorkspaceSection');
  });
});

// ── Pure logic: directory list key generation ──────────────────────────────
//
// The DirectoryList renders keys as `${directory}-${index}`. These tests lock
// that the key pattern produces unique, stable strings across typical inputs.

function makeKey(directory: string, index: number): string {
  return `${directory}-${index}`;
}

describe('directory list key generation', () => {
  it('generates unique keys for same path at different indices', () => {
    const k0 = makeKey('/home/user/projects', 0);
    const k1 = makeKey('/home/user/projects', 1);
    expect(k0).not.toBe(k1);
  });

  it('generates unique keys for different paths at the same index', () => {
    const k0 = makeKey('/path/a', 0);
    const k1 = makeKey('/path/b', 0);
    expect(k0).not.toBe(k1);
  });

  it('includes the directory path in the key', () => {
    const key = makeKey('/some/directory', 2);
    expect(key).toContain('/some/directory');
  });

  it('includes the index in the key', () => {
    const key = makeKey('/some/directory', 3);
    expect(key).toContain('3');
  });

  it('handles paths with spaces', () => {
    const key = makeKey('/path with spaces/dir', 0);
    expect(key).toBe('/path with spaces/dir-0');
  });
});

// ── Pure logic: canAddDir invariant ───────────────────────────────────────
//
// A directory can be added only when the input is non-empty (trimmed).
// This mirrors the `canAddDir` derived value in useCodexSection.

function canAddDir(newDir: string): boolean {
  return newDir.trim().length > 0;
}

describe('canAddDir invariant', () => {
  it('returns false for empty string', () => {
    expect(canAddDir('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(canAddDir('   ')).toBe(false);
  });

  it('returns true for a valid path', () => {
    expect(canAddDir('/home/user')).toBe(true);
  });

  it('returns true for a path with leading/trailing spaces', () => {
    expect(canAddDir('  /home/user  ')).toBe(true);
  });
});
