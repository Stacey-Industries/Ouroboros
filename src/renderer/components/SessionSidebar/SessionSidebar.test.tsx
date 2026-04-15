/**
 * SessionSidebar.test.tsx
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '../../types/electron';
import { SessionSidebar } from './SessionSidebar';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

// ─── electronAPI mock ─────────────────────────────────────────────────────────

let onChangedCallback: ((sessions: SessionRecord[]) => void) | null = null;

const mockApi = {
  sessionCrud: {
    list: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
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
};

beforeEach(() => {
  onChangedCallback = null;
  vi.clearAllMocks();

  mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [] });
  mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: null });
  mockApi.config.getAll.mockResolvedValue({ layout: { chatPrimary: true } });
  mockApi.sessionCrud.onChanged.mockImplementation((cb: (s: SessionRecord[]) => void) => {
    onChangedCallback = cb;
    return vi.fn();
  });

  Object.defineProperty(window, 'electronAPI', {
    value: mockApi,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionSidebar', () => {
  it('renders null when layout.chatPrimary flag is off', async () => {
    mockApi.config.getAll.mockResolvedValue({ layout: { chatPrimary: false } });
    const { container } = render(<SessionSidebar />);
    await waitFor(() => expect(mockApi.config.getAll).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Sessions" heading when flag is on', async () => {
    render(<SessionSidebar />);
    await waitFor(() => expect(screen.getByText('Sessions')).toBeTruthy());
  });

  it('shows empty-state message when no sessions exist', async () => {
    render(<SessionSidebar />);
    await waitFor(() => {
      const el = screen.queryByText(/no sessions yet/i);
      expect(el).toBeTruthy();
    });
  });

  it('renders session rows after load', async () => {
    mockApi.sessionCrud.list.mockResolvedValue({
      success: true,
      sessions: [makeSession('aaa-111', '/projects/alpha')],
    });
    render(<SessionSidebar />);
    await waitFor(() => expect(screen.getAllByText('alpha').length).toBeGreaterThan(0));
  });

  it('groups sessions by project root', async () => {
    mockApi.sessionCrud.list.mockResolvedValue({
      success: true,
      sessions: [
        makeSession('s1', '/projects/alpha'),
        makeSession('s2', '/projects/beta'),
      ],
    });
    render(<SessionSidebar />);
    await waitFor(() => {
      expect(screen.getAllByText('alpha').length).toBeGreaterThan(0);
      expect(screen.getAllByText('beta').length).toBeGreaterThan(0);
    });
  });

  it('dispatches agent-ide:session-switch when a row is clicked', async () => {
    mockApi.sessionCrud.list.mockResolvedValue({
      success: true,
      sessions: [makeSession('click-id', '/projects/alpha')],
    });
    render(<SessionSidebar />);
    await waitFor(() => expect(screen.getByRole('row', { name: /alpha.*last used/i })).toBeTruthy());

    const dispatched: CustomEvent[] = [];
    const listener = (e: Event): void => { dispatched.push(e as CustomEvent); };
    window.addEventListener('agent-ide:session-switch', listener);

    fireEvent.click(screen.getByRole('row', { name: /alpha.*last used/i }));
    window.removeEventListener('agent-ide:session-switch', listener);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].detail.sessionId).toBe('click-id');
  });

  it('live-updates the list when onChanged fires', async () => {
    render(<SessionSidebar />);
    await waitFor(() => expect(screen.queryByText(/no sessions yet/i)).toBeTruthy());

    act(() => { onChangedCallback?.([makeSession('live-s1', '/projects/live')]); });

    await waitFor(() => expect(screen.getAllByText('live').length).toBeGreaterThan(0));
  });

  it('ArrowDown moves focus to the next row', async () => {
    mockApi.sessionCrud.list.mockResolvedValue({
      success: true,
      sessions: [
        makeSession('r1', '/projects/proj'),
        makeSession('r2', '/projects/proj'),
      ],
    });
    render(<SessionSidebar />);
    // Wait for session rows (tabindex=0) to appear — skip the non-focusable header row
    await waitFor(() => {
      const focusable = document.querySelectorAll('[role="row"][tabindex="0"]');
      expect(focusable.length).toBeGreaterThanOrEqual(2);
    });

    const sessionRows = [...document.querySelectorAll<HTMLElement>('[role="row"][tabindex="0"]')];
    sessionRows[0].focus();
    const list = sessionRows[0].closest('[class*="overflow-y"]') as HTMLElement;
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(sessionRows[1]));
  });

  it('renders the New session button', async () => {
    render(<SessionSidebar />);
    await waitFor(() => expect(screen.getByRole('button', { name: /new session/i })).toBeTruthy());
  });
});
