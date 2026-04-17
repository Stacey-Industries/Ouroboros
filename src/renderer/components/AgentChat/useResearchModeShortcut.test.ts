/**
 * useResearchModeShortcut.test.ts — Unit tests for Wave 30 Phase G
 * Ctrl+Alt+R research mode cycle shortcut.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useResearchModeShortcut } from './useResearchModeShortcut';

// ─── Mock electronAPI ─────────────────────────────────────────────────────────

const mockGetSessionMode = vi.fn();
const mockSetSessionMode = vi.fn();

function installApi(): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      research: {
        getSessionMode: mockGetSessionMode,
        setSessionMode: mockSetSessionMode,
      },
    },
    writable: true,
    configurable: true,
  });
}

// ─── Keyboard helpers ─────────────────────────────────────────────────────────

function fireCtrlAltR(): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'r',
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      bubbles: true,
    }),
  );
}

function fireCtrlShiftR(): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'R',
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      bubbles: true,
    }),
  );
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  installApi();
  mockGetSessionMode.mockResolvedValue({ success: true, mode: 'conservative' });
  mockSetSessionMode.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useResearchModeShortcut — Ctrl+Alt+R cycles mode', () => {
  it('calls getSessionMode then setSessionMode with the next mode', async () => {
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: 'sess-1', toast }));
    await act(async () => { fireCtrlAltR(); });
    unmount();
    expect(mockGetSessionMode).toHaveBeenCalledWith('sess-1');
    // conservative → aggressive
    expect(mockSetSessionMode).toHaveBeenCalledWith('sess-1', 'aggressive');
  });

  it('cycles off → conservative', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'off' });
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: 'sess-2', toast }));
    await act(async () => { fireCtrlAltR(); });
    unmount();
    expect(mockSetSessionMode).toHaveBeenCalledWith('sess-2', 'conservative');
  });

  it('cycles aggressive → off', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'aggressive' });
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: 'sess-3', toast }));
    await act(async () => { fireCtrlAltR(); });
    unmount();
    expect(mockSetSessionMode).toHaveBeenCalledWith('sess-3', 'off');
  });

  it('shows a toast with the new mode label', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'conservative' });
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: 'sess-4', toast }));
    await act(async () => { fireCtrlAltR(); });
    unmount();
    expect(toast).toHaveBeenCalledOnce();
    const [msg] = toast.mock.calls[0] as [string, string];
    expect(msg).toMatch(/aggressive/i);
  });

  it('shows toast with "no active session" when sessionId is null', async () => {
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: null, toast }));
    await act(async () => { fireCtrlAltR(); });
    unmount();
    expect(mockGetSessionMode).not.toHaveBeenCalled();
    expect(mockSetSessionMode).not.toHaveBeenCalled();
    const [msg] = toast.mock.calls[0] as [string, string];
    expect(msg).toMatch(/no active session/i);
  });

  it('does NOT fire on Ctrl+Shift+R (reserved for Reload Window)', async () => {
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: 'sess-5', toast }));
    await act(async () => { fireCtrlShiftR(); });
    unmount();
    expect(mockGetSessionMode).not.toHaveBeenCalled();
    expect(mockSetSessionMode).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('handles getSessionMode failure gracefully by defaulting to conservative', async () => {
    mockGetSessionMode.mockRejectedValue(new Error('IPC failed'));
    const toast = vi.fn();
    const { unmount } = renderHook(() => useResearchModeShortcut({ sessionId: 'sess-6', toast }));
    await act(async () => { fireCtrlAltR(); });
    unmount();
    // Falls back to conservative → cycles to aggressive
    expect(mockSetSessionMode).toHaveBeenCalledWith('sess-6', 'aggressive');
  });

  it('removes the keydown listener on unmount', async () => {
    const toast = vi.fn();
    const { unmount } = renderHook(() =>
      useResearchModeShortcut({ sessionId: 'sess-7', toast }),
    );
    unmount();
    vi.clearAllMocks();
    await act(async () => { fireCtrlAltR(); });
    expect(mockGetSessionMode).not.toHaveBeenCalled();
    expect(mockSetSessionMode).not.toHaveBeenCalled();
  });
});
