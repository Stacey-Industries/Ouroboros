/**
 * SessionSidebar.virtualized.test.tsx — Virtualization integration test.
 *
 * Mounts SessionSidebar with 25 sessions and asserts the virtualizer container
 * is active (data-testid="session-virtual-list" present in the DOM).
 *
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '../../types/electron';
import { SessionSidebar } from './SessionSidebar';

// ─── @tanstack/react-virtual mock (passthrough — jsdom has no layout) ─────────

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
    let offset = 0;
    const items = Array.from({ length: count }, (_, i) => {
      const size = estimateSize(i);
      const item = { index: i, key: i, start: offset, size };
      offset += size;
      return item;
    });
    return { getVirtualItems: () => items, getTotalSize: () => offset };
  },
}));

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeSession(id: string, projectRoot = '/projects/big'): SessionRecord {
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

const TWENTY_FIVE_SESSIONS = Array.from({ length: 25 }, (_, i) =>
  makeSession(`sess-${i}`),
);

// ─── electronAPI mock ─────────────────────────────────────────────────────────

let onChangedCallback: ((sessions: SessionRecord[]) => void) | null = null;

const mockApi = {
  sessionCrud: {
    list: vi.fn().mockResolvedValue({ success: true, sessions: TWENTY_FIVE_SESSIONS }),
    active: vi.fn().mockResolvedValue({ success: true, sessionId: null }),
    onChanged: vi.fn((cb: (s: SessionRecord[]) => void) => {
      onChangedCallback = cb;
      return vi.fn();
    }),
    create: vi.fn().mockResolvedValue({ success: true }),
  },
  files: {
    selectFolder: vi.fn().mockResolvedValue({ success: true, path: '/projects/new' }),
  },
  config: {
    getAll: vi.fn().mockResolvedValue({ layout: { chatPrimary: true } }),
  },
  folderCrud: {
    list: vi.fn().mockResolvedValue({ success: true, folders: [] }),
    onChanged: vi.fn(() => vi.fn()),
  },
};

beforeEach(() => {
  onChangedCallback = null;
  vi.clearAllMocks();
  mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: TWENTY_FIVE_SESSIONS });
  mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: null });
  mockApi.config.getAll.mockResolvedValue({ layout: { chatPrimary: true } });
  mockApi.sessionCrud.onChanged.mockImplementation((cb: (s: SessionRecord[]) => void) => {
    onChangedCallback = cb;
    return vi.fn();
  });
  Object.defineProperty(window, 'electronAPI', {
    value: mockApi, writable: true, configurable: true,
  });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionSidebar virtualisation', () => {
  it('activates the virtualizer when 25 sessions are loaded', async () => {
    render(<SessionSidebar />);
    await waitFor(() =>
      expect(screen.getByTestId('session-virtual-list')).toBeTruthy(),
    );
  });

  it('does not activate virtualizer when ≤ 20 sessions are loaded', async () => {
    const twenty = TWENTY_FIVE_SESSIONS.slice(0, 20);
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: twenty });
    render(<SessionSidebar />);
    // Wait for load to complete (Sessions heading should appear)
    await waitFor(() => expect(screen.getByText('Sessions')).toBeTruthy());
    // Give any async state updates time to settle
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('session-virtual-list')).toBeNull();
  });

  it('transitions to virtualizer when onChanged pushes > 20 sessions', async () => {
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [] });
    render(<SessionSidebar />);
    await waitFor(() => expect(screen.getByText('Sessions')).toBeTruthy());

    act(() => { onChangedCallback?.(TWENTY_FIVE_SESSIONS); });

    await waitFor(() =>
      expect(screen.getByTestId('session-virtual-list')).toBeTruthy(),
    );
  });
});
