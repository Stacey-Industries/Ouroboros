/**
 * SubagentLiveChip.test.tsx — Unit tests for SubagentLiveChip.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubagentLiveChip } from './SubagentLiveChip';

// ─── Mock API ─────────────────────────────────────────────────────────────────

type OnUpdatedCb = (event: { parentSessionId: string }) => void;
let onUpdatedCallback: OnUpdatedCb | null = null;

const mockLiveCount = vi.fn();
const mockOnUpdated = vi.fn((cb: OnUpdatedCb) => {
  onUpdatedCallback = cb;
  return vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  onUpdatedCallback = null;

  Object.defineProperty(window, 'electronAPI', {
    value: {
      subagent: {
        liveCount: mockLiveCount,
        onUpdated: mockOnUpdated,
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ─── Zero-count hiding ────────────────────────────────────────────────────────

describe('SubagentLiveChip — zero state', () => {
  it('renders nothing when live count is zero', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 0 });
    const { container } = render(
      <SubagentLiveChip parentSessionId="sess-1" />,
    );
    await waitFor(() => expect(mockLiveCount).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when liveCount call fails', async () => {
    mockLiveCount.mockResolvedValue({ success: false, error: 'err' });
    const { container } = render(
      <SubagentLiveChip parentSessionId="sess-1" />,
    );
    await waitFor(() => expect(mockLiveCount).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});

// ─── Non-zero count rendering ─────────────────────────────────────────────────

describe('SubagentLiveChip — non-zero count', () => {
  it('renders chip with count when live count > 0', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 2 });
    render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  it('uses singular aria-label for count of 1', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 1 });
    render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByLabelText(/1 subagent running/i)).toBeTruthy(),
    );
  });

  it('uses plural aria-label for count > 1', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 3 });
    render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByLabelText(/3 subagents running/i)).toBeTruthy(),
    );
  });
});

// ─── onClick ──────────────────────────────────────────────────────────────────

describe('SubagentLiveChip — onClick', () => {
  it('calls onClick when chip is clicked', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 1 });
    const onClick = vi.fn();
    render(<SubagentLiveChip parentSessionId="sess-1" onClick={onClick} />);
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders without onClick prop without crashing', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 1 });
    render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
  });
});

// ─── Live updates ─────────────────────────────────────────────────────────────

describe('SubagentLiveChip — live updates', () => {
  it('refreshes count when onUpdated fires for same session', async () => {
    mockLiveCount.mockResolvedValueOnce({ success: true, count: 0 });
    const { container } = render(
      <SubagentLiveChip parentSessionId="sess-1" />,
    );
    await waitFor(() => expect(mockLiveCount).toHaveBeenCalledOnce());
    expect(container.firstChild).toBeNull();

    mockLiveCount.mockResolvedValue({ success: true, count: 2 });
    onUpdatedCallback?.({ parentSessionId: 'sess-1' });
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  it('does not refresh for a different session id', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 1 });
    render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() => expect(mockLiveCount).toHaveBeenCalledOnce());

    mockLiveCount.mockClear();
    onUpdatedCallback?.({ parentSessionId: 'other-sess' });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockLiveCount).not.toHaveBeenCalled();
  });

  it('subscribes to onUpdated on mount', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 0 });
    render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() => expect(mockOnUpdated).toHaveBeenCalledOnce());
  });

  it('unsubscribes from onUpdated on unmount', async () => {
    mockLiveCount.mockResolvedValue({ success: true, count: 0 });
    const { unmount } = render(<SubagentLiveChip parentSessionId="sess-1" />);
    await waitFor(() => expect(mockOnUpdated).toHaveBeenCalledOnce());
    unmount();
    const cleanupFn = mockOnUpdated.mock.results[0].value;
    expect(cleanupFn).toHaveBeenCalled();
  });
});
