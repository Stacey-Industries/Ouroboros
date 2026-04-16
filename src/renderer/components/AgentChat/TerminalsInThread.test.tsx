/**
 * @vitest-environment jsdom
 *
 * TerminalsInThread.test.tsx — Wave 21 Phase G
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOCUS_TERMINAL_SESSION_EVENT } from '../../hooks/appEventNames';
import { TerminalsInThread } from './TerminalsInThread';

// ─── Minimal electronAPI mock ─────────────────────────────────────────────────

const mockGetLinkedTerminals = vi.fn();
const mockGetShellState = vi.fn();
const mockOnChanged = vi.fn();

beforeEach(() => {
  mockGetLinkedTerminals.mockResolvedValue({ success: true, sessionIds: [] });
  mockGetShellState.mockResolvedValue({ success: false });
  mockOnChanged.mockReturnValue(() => { /* cleanup noop */ });

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      agentChat: { getLinkedTerminals: mockGetLinkedTerminals },
      pty: { getShellState: mockGetShellState },
      sessionCrud: { onChanged: mockOnChanged },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TerminalsInThread', () => {
  it('renders nothing when no sessions are linked', async () => {
    mockGetLinkedTerminals.mockResolvedValue({ success: true, sessionIds: [] });
    const { container } = render(<TerminalsInThread threadId="thread-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders session rows when sessions are linked', async () => {
    mockGetLinkedTerminals.mockResolvedValue({
      success: true,
      sessionIds: ['sess-abc', 'sess-def'],
    });
    mockGetShellState.mockResolvedValue({ success: true, lastCommand: 'npm test' });

    render(<TerminalsInThread threadId="thread-2" />);

    await waitFor(() => {
      expect(screen.getByText('Terminals (2)')).toBeTruthy();
    });
    expect(screen.getByText('sess-abc')).toBeTruthy();
    expect(screen.getByText('sess-def')).toBeTruthy();
  });

  it('dispatches focus-terminal-session DOM event on row click', async () => {
    mockGetLinkedTerminals.mockResolvedValue({
      success: true,
      sessionIds: ['sess-xyz'],
    });
    mockGetShellState.mockResolvedValue({ success: true, lastCommand: '' });

    render(<TerminalsInThread threadId="thread-3" />);
    await waitFor(() => expect(screen.getByText('sess-xyz')).toBeTruthy());

    const dispatched: CustomEvent[] = [];
    window.addEventListener(FOCUS_TERMINAL_SESSION_EVENT, (e) => {
      dispatched.push(e as CustomEvent);
    });

    fireEvent.click(screen.getByText('sess-xyz'));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].detail).toEqual({ sessionId: 'sess-xyz' });
  });

  it('collapses list when header button is clicked', async () => {
    mockGetLinkedTerminals.mockResolvedValue({
      success: true,
      sessionIds: ['sess-col'],
    });
    mockGetShellState.mockResolvedValue({ success: false });

    render(<TerminalsInThread threadId="thread-4" />);
    await waitFor(() => expect(screen.getByText('sess-col')).toBeTruthy());

    const header = screen.getByRole('button', { name: /Terminals/i });
    fireEvent.click(header);

    await waitFor(() => {
      expect(screen.queryByText('sess-col')).toBeNull();
    });
  });

  it('shows exited status when getShellState fails for a session', async () => {
    mockGetLinkedTerminals.mockResolvedValue({
      success: true,
      sessionIds: ['sess-exited'],
    });
    mockGetShellState.mockResolvedValue({ success: false });

    render(<TerminalsInThread threadId="thread-5" />);
    await waitFor(() => expect(screen.getByText('sess-exited')).toBeTruthy());

    const dot = screen.getByLabelText('exited');
    expect(dot).toBeTruthy();
  });

  it('subscribes to sessionCrud:onChanged on mount', async () => {
    render(<TerminalsInThread threadId="thread-6" />);
    await waitFor(() => expect(mockOnChanged).toHaveBeenCalledTimes(1));
  });

  it('calls cleanup on unmount', async () => {
    const cleanup = vi.fn();
    mockOnChanged.mockReturnValue(cleanup);

    const { unmount } = render(<TerminalsInThread threadId="thread-7" />);
    await waitFor(() => expect(mockOnChanged).toHaveBeenCalledTimes(1));
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
