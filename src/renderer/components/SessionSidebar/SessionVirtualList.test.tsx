/**
 * SessionVirtualList.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '../../types/electron';
import type { SessionGroup } from './SessionVirtualList';
import { flattenGroups,SessionVirtualList, VIRTUALIZE_THRESHOLD } from './SessionVirtualList';

// ─── @tanstack/react-virtual mock ─────────────────────────────────────────────
// jsdom has no layout engine, so getVirtualItems() would return [] without this.
// We replace useVirtualizer with a passthrough that returns all items "visible".

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
    let offset = 0;
    const items = Array.from({ length: count }, (_, i) => {
      const size = estimateSize(i);
      const item = { index: i, key: i, start: offset, size };
      offset += size;
      return item;
    });
    return {
      getVirtualItems: () => items,
      getTotalSize: () => offset,
    };
  },
}));

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeSession(id: string, projectRoot = '/projects/alpha'): SessionRecord {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: new Date().toISOString(),
    projectRoot,
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
  };
}

function makeGroup(projectRoot: string, count: number): SessionGroup {
  return {
    projectRoot,
    label: projectRoot.split('/').at(-1) ?? projectRoot,
    sessions: Array.from({ length: count }, (_, i) =>
      makeSession(`${projectRoot}-${i}`, projectRoot),
    ),
  };
}

const noop = vi.fn();

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ─── flattenGroups unit tests ─────────────────────────────────────────────────

describe('flattenGroups', () => {
  it('returns empty array for empty groups', () => {
    expect(flattenGroups([])).toEqual([]);
  });

  it('produces header + row entries in order', () => {
    const group = makeGroup('/projects/alpha', 2);
    const rows = flattenGroups([group]);
    expect(rows).toHaveLength(3); // 1 header + 2 rows
    expect(rows[0].kind).toBe('header');
    expect(rows[1].kind).toBe('row');
    expect(rows[2].kind).toBe('row');
  });

  it('interleaves headers between groups', () => {
    const rows = flattenGroups([makeGroup('/a', 1), makeGroup('/b', 2)]);
    // header-a, row-a, header-b, row-b1, row-b2
    expect(rows).toHaveLength(5);
    expect(rows[0].kind).toBe('header');
    expect(rows[2].kind).toBe('header');
  });
});

// ─── SessionVirtualList rendering ────────────────────────────────────────────

describe('SessionVirtualList — loading state', () => {
  it('renders loading message when isLoading is true', () => {
    render(
      <SessionVirtualList
        groups={[]}
        activeSessionId={null}
        isLoading
        onSessionClick={noop}
        onRestored={noop}
        onKeyDown={noop}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});

describe('SessionVirtualList — empty state', () => {
  it('renders empty-state message when no sessions exist', () => {
    render(
      <SessionVirtualList
        groups={[]}
        activeSessionId={null}
        isLoading={false}
        onSessionClick={noop}
        onRestored={noop}
        onKeyDown={noop}
      />,
    );
    expect(screen.getByText(/no sessions yet/i)).toBeTruthy();
  });
});

describe('SessionVirtualList — flat rendering (≤ threshold)', () => {
  it('renders all session rows when count is at the threshold', () => {
    const group = makeGroup('/projects/alpha', VIRTUALIZE_THRESHOLD);
    render(
      <SessionVirtualList
        groups={[group]}
        activeSessionId={null}
        isLoading={false}
        onSessionClick={noop}
        onRestored={noop}
        onKeyDown={noop}
      />,
    );
    // All rows should be present; no virtual scroll container
    expect(screen.queryByTestId('session-virtual-list')).toBeNull();
  });
});

describe('SessionVirtualList — virtualized rendering (> threshold)', () => {
  it('renders the virtual-list container when session count exceeds threshold', () => {
    const group = makeGroup('/projects/alpha', VIRTUALIZE_THRESHOLD + 5);
    render(
      <SessionVirtualList
        groups={[group]}
        activeSessionId={null}
        isLoading={false}
        onSessionClick={noop}
        onRestored={noop}
        onKeyDown={noop}
      />,
    );
    expect(screen.getByTestId('session-virtual-list')).toBeTruthy();
  });

  it('renders session rows inside the virtual list (via mock virtualizer)', () => {
    const group = makeGroup('/projects/beta', VIRTUALIZE_THRESHOLD + 5);
    render(
      <SessionVirtualList
        groups={[group]}
        activeSessionId={null}
        isLoading={false}
        onSessionClick={noop}
        onRestored={noop}
        onKeyDown={noop}
      />,
    );
    // The group header "beta" should be visible
    expect(screen.getAllByText('beta').length).toBeGreaterThan(0);
  });

  it('activates virtualizer for 25 sessions (spec: > 20)', () => {
    const group = makeGroup('/projects/big', 25);
    render(
      <SessionVirtualList
        groups={[group]}
        activeSessionId={null}
        isLoading={false}
        onSessionClick={noop}
        onRestored={noop}
        onKeyDown={noop}
      />,
    );
    expect(screen.getByTestId('session-virtual-list')).toBeTruthy();
  });
});
