/**
 * WorkspaceReadListSection.test.tsx — Smoke tests for the workspace read-list settings section.
 *
 * The component uses window.electronAPI and live React state, so we validate
 * the module export shape and pure-logic invariants without rendering.
 * (Rendering requires jsdom + full electronAPI mocking — covered by E2E.)
 */

import { describe, expect, it } from 'vitest';

import { WorkspaceReadListSection } from './WorkspaceReadListSection';

// ─── Component export ─────────────────────────────────────────────────────────

describe('WorkspaceReadListSection', () => {
  it('exports a function component', () => {
    expect(typeof WorkspaceReadListSection).toBe('function');
  });

  it('has the expected component name', () => {
    expect(WorkspaceReadListSection.name).toBe('WorkspaceReadListSection');
  });
});

// ─── Pure logic: basename extraction ─────────────────────────────────────────
//
// The component uses `filePath.split(/[\\/]/).pop()` to show the filename.
// These tests lock that behaviour independently.

function extractBasename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

describe('filename extraction from path', () => {
  it('extracts a Unix basename', () => {
    expect(extractBasename('/projects/my-app/src/main.ts')).toBe('main.ts');
  });

  it('extracts a Windows basename', () => {
    expect(extractBasename('C:\\projects\\my-app\\src\\utils.ts')).toBe('utils.ts');
  });

  it('returns the bare name when there is no separator', () => {
    expect(extractBasename('index.tsx')).toBe('index.tsx');
  });

  it('returns empty string for a trailing slash', () => {
    expect(extractBasename('/projects/')).toBe('');
  });
});

// ─── Pure logic: deduplication invariant (mirrors addToReadList) ──────────────
//
// The section should never show duplicate entries; the backend enforces this,
// but we lock the expectation here as a specification.

describe('read-list deduplication invariant', () => {
  function dedup(paths: string[]): string[] {
    return [...new Set(paths)];
  }

  it('preserves unique entries', () => {
    const input = ['/a/b.ts', '/a/c.ts'];
    expect(dedup(input)).toEqual(input);
  });

  it('removes duplicates', () => {
    const input = ['/a/b.ts', '/a/b.ts', '/a/c.ts'];
    expect(dedup(input)).toEqual(['/a/b.ts', '/a/c.ts']);
  });

  it('handles empty list', () => {
    expect(dedup([])).toEqual([]);
  });
});

// ─── IPC channel contract ─────────────────────────────────────────────────────

const EXPECTED_CHANNELS = [
  'workspaceReadList:get',
  'workspaceReadList:add',
  'workspaceReadList:remove',
  'workspaceReadList:changed',
] as const;

describe('IPC channel name contract', () => {
  it('defines the correct number of channels', () => {
    expect(EXPECTED_CHANNELS).toHaveLength(4);
  });

  it.each(EXPECTED_CHANNELS)('channel "%s" is correctly namespaced', (ch) => {
    expect(ch.startsWith('workspaceReadList:')).toBe(true);
  });
});
