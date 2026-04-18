/**
 * SystemPromptSessionPicker.test.tsx — jsdom smoke tests for session picker.
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemPromptSessionPicker } from './SystemPromptSessionPicker';

// ── electronAPI mock ──────────────────────────────────────────────────────────

const mockListSessions = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      pty: { listSessions: mockListSessions },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SystemPromptSessionPicker', () => {
  const SESSIONS = [
    { id: 'aaaa-1111-bbbb-2222', cwd: '/home/user/project' },
    { id: 'cccc-3333-dddd-4444', cwd: '/home/user/other' },
  ];

  it('renders the session dropdown when sessions exist', async () => {
    mockListSessions.mockResolvedValue(SESSIONS);
    await act(async () => {
      render(
        <SystemPromptSessionPicker onSelect={vi.fn()} selectedId={SESSIONS[0].id} />,
      );
    });
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('shows all sessions as options', async () => {
    mockListSessions.mockResolvedValue(SESSIONS);
    await act(async () => {
      render(
        <SystemPromptSessionPicker onSelect={vi.fn()} selectedId={SESSIONS[0].id} />,
      );
    });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
  });

  it('calls onSelect with first session id when no selection and sessions load', async () => {
    mockListSessions.mockResolvedValue(SESSIONS);
    const onSelect = vi.fn();
    await act(async () => {
      render(<SystemPromptSessionPicker onSelect={onSelect} selectedId={null} />);
    });
    expect(onSelect).toHaveBeenCalledWith(SESSIONS[0].id);
  });

  it('calls onSelect when user changes selection', async () => {
    mockListSessions.mockResolvedValue(SESSIONS);
    const onSelect = vi.fn();
    await act(async () => {
      render(
        <SystemPromptSessionPicker onSelect={onSelect} selectedId={SESSIONS[0].id} />,
      );
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: SESSIONS[1].id },
      });
    });
    expect(onSelect).toHaveBeenCalledWith(SESSIONS[1].id);
  });

  it('shows "no active sessions" message when list is empty', async () => {
    mockListSessions.mockResolvedValue([]);
    await act(async () => {
      render(<SystemPromptSessionPicker onSelect={vi.fn()} selectedId={null} />);
    });
    expect(screen.getByText(/no active sessions/i)).toBeDefined();
  });

  it('shows refresh button when no sessions', async () => {
    mockListSessions.mockResolvedValue([]);
    await act(async () => {
      render(<SystemPromptSessionPicker onSelect={vi.fn()} selectedId={null} />);
    });
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDefined();
  });

  it('shows refresh button (↺) alongside dropdown when sessions exist', async () => {
    mockListSessions.mockResolvedValue(SESSIONS);
    await act(async () => {
      render(
        <SystemPromptSessionPicker onSelect={vi.fn()} selectedId={SESSIONS[0].id} />,
      );
    });
    expect(screen.getByRole('button', { name: /refresh session list/i })).toBeDefined();
  });

  it('re-calls listSessions when refresh button clicked', async () => {
    mockListSessions.mockResolvedValue([]);
    await act(async () => {
      render(<SystemPromptSessionPicker onSelect={vi.fn()} selectedId={null} />);
    });
    mockListSessions.mockResolvedValue(SESSIONS);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    });
    expect(mockListSessions).toHaveBeenCalledTimes(2);
  });

  it('handles listSessions rejection gracefully', async () => {
    mockListSessions.mockRejectedValue(new Error('pty unavailable'));
    await act(async () => {
      render(<SystemPromptSessionPicker onSelect={vi.fn()} selectedId={null} />);
    });
    expect(screen.getByText(/no active sessions/i)).toBeDefined();
  });
});
