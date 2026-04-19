/**
 * buildThreadTree.test.ts — Wave 41 Phase E.1
 *
 * Verifies that buildThreadTree correctly follows top-level parentThreadId
 * (canonical field written by forkThreadImpl) and falls back to the legacy
 * branchInfo.parentThreadId for pre-Wave-41 threads.
 */
import { describe, expect, it } from 'vitest';

import type { AgentChatThreadRecord } from '../../types/electron';
import { buildThreadTree, flattenThreadTree } from './buildThreadTree';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeThread(
  overrides: Partial<AgentChatThreadRecord> & { id: string },
): AgentChatThreadRecord {
  return {
    version: 1,
    workspaceRoot: '/work',
    createdAt: 1000,
    updatedAt: 1000,
    title: overrides.id,
    status: 'idle',
    messages: [],
    tags: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildThreadTree', () => {
  it('returns all threads as roots when none have parentThreadId', () => {
    const threads = [makeThread({ id: 'a' }), makeThread({ id: 'b' })];
    const roots = buildThreadTree(threads);
    expect(roots).toHaveLength(2);
  });

  it('nests a fork under its parent using top-level parentThreadId', () => {
    const parent = makeThread({ id: 'parent' });
    const fork = makeThread({ id: 'fork', parentThreadId: 'parent' });
    const roots = buildThreadTree([parent, fork]);

    expect(roots).toHaveLength(1);
    expect(roots[0].thread.id).toBe('parent');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].thread.id).toBe('fork');
  });

  it('falls back to branchInfo.parentThreadId for legacy pre-Wave-41 threads', () => {
    const parent = makeThread({ id: 'parent' });
    // Legacy thread: has branchInfo.parentThreadId but no top-level parentThreadId
    const legacy = makeThread({
      id: 'legacy-fork',
      branchInfo: { parentThreadId: 'parent' } as AgentChatThreadRecord['branchInfo'],
    });
    const roots = buildThreadTree([parent, legacy]);

    expect(roots).toHaveLength(1);
    expect(roots[0].thread.id).toBe('parent');
    expect(roots[0].children[0].thread.id).toBe('legacy-fork');
  });

  it('top-level parentThreadId takes precedence over branchInfo.parentThreadId', () => {
    const parent = makeThread({ id: 'parent' });
    const other = makeThread({ id: 'other' });
    const fork = makeThread({
      id: 'fork',
      parentThreadId: 'parent',
      branchInfo: { parentThreadId: 'other' } as AgentChatThreadRecord['branchInfo'],
    });
    const roots = buildThreadTree([parent, other, fork]);
    const flat = flattenThreadTree(roots);
    const forkNode = flat.find((n) => n.thread.id === 'fork');
    const parentNode = roots.find((n) => n.thread.id === 'parent');

    expect(parentNode?.children[0].thread.id).toBe('fork');
    expect(forkNode?.depth).toBe(1);
  });

  it('handles fork-inside-fork (nested forks)', () => {
    const root = makeThread({ id: 'root' });
    const child = makeThread({ id: 'child', parentThreadId: 'root' });
    const grandchild = makeThread({ id: 'grandchild', parentThreadId: 'child' });
    const roots = buildThreadTree([root, child, grandchild]);

    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].children[0].thread.id).toBe('grandchild');
    expect(roots[0].children[0].children[0].depth).toBe(2);
  });

  it('treats a fork with an unknown parentThreadId as a root', () => {
    const fork = makeThread({ id: 'fork', parentThreadId: 'ghost-id' });
    const roots = buildThreadTree([fork]);
    expect(roots).toHaveLength(1);
    expect(roots[0].thread.id).toBe('fork');
  });
});
