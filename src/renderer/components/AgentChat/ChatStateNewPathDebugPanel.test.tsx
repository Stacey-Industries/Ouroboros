// @vitest-environment jsdom
/**
 * ChatStateNewPathDebugPanel.test.tsx — smoke tests for the Wave 86 debug panel.
 *
 * Tests render output and subscription wiring without requiring a real IPC bridge.
 */

import type { ChatStateSnapshot } from '@shared/types/chatStateDiff';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock window.electronAPI ──────────────────────────────────────────────────

const mockRequestSnapshot = vi.fn();
const mockOnStateDiff = vi.fn(() => vi.fn());

const mockChatStateNewPath = {
  requestSnapshot: mockRequestSnapshot,
  onStateDiff: mockOnStateDiff,
  sendMessage: vi.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: { chatStateNewPath: mockChatStateNewPath },
});

// ─── Import after mock ────────────────────────────────────────────────────────

import { ChatStateNewPathDebugPanel } from './ChatStateNewPathDebugPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ChatStateSnapshot> = {}): ChatStateSnapshot {
  return {
    threadId: 't1' as import('@shared/types/canonicalChatEvent').ThreadId,
    status: 'idle',
    accumulatedText: '',
    activeTurnId: undefined,
    seq: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatStateNewPathDebugPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnStateDiff.mockReturnValue(vi.fn());
  });

  it('renders the thread id', async () => {
    mockRequestSnapshot.mockResolvedValue(makeSnapshot());
    await act(async () => {
      render(<ChatStateNewPathDebugPanel threadId="t1" />);
    });
    expect(screen.getByText(/thread: t1/)).toBeTruthy();
  });

  it('shows status from snapshot', async () => {
    mockRequestSnapshot.mockResolvedValue(makeSnapshot({ status: 'streaming' }));
    await act(async () => {
      render(<ChatStateNewPathDebugPanel threadId="t1" />);
    });
    expect(screen.getByText(/status: streaming/)).toBeTruthy();
  });

  it('shows error when requestSnapshot rejects', async () => {
    mockRequestSnapshot.mockRejectedValue(new Error('flag disabled'));
    await act(async () => {
      render(<ChatStateNewPathDebugPanel threadId="t1" />);
    });
    expect(screen.getByText(/error: flag disabled/)).toBeTruthy();
  });

  it('subscribes to onStateDiff with the correct threadId', async () => {
    mockRequestSnapshot.mockResolvedValue(makeSnapshot());
    await act(async () => {
      render(<ChatStateNewPathDebugPanel threadId="t1" />);
    });
    expect(mockOnStateDiff).toHaveBeenCalledWith('t1', expect.any(Function));
  });

  it('calls the unsub cleanup on unmount', async () => {
    const unsub = vi.fn();
    mockOnStateDiff.mockReturnValue(unsub);
    mockRequestSnapshot.mockResolvedValue(makeSnapshot());
    let unmount: () => void;
    await act(async () => {
      ({ unmount } = render(<ChatStateNewPathDebugPanel threadId="t1" />));
    });
    act(() => {
      unmount();
    });
    expect(unsub).toHaveBeenCalled();
  });
});
