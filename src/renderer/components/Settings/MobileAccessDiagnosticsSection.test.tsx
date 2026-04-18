/**
 * MobileAccessDiagnosticsSection.test.tsx — Tests for timeout stats panel.
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileAccessDiagnosticsSection } from './MobileAccessDiagnosticsSection';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetTimeoutStats = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      mobileAccess: {
        generatePairingCode: vi.fn(),
        listPairedDevices: vi.fn().mockResolvedValue({ success: true, devices: [] }),
        revokePairedDevice: vi.fn().mockResolvedValue({ success: true }),
        getTimeoutStats: mockGetTimeoutStats,
      },
    },
  });

  mockGetTimeoutStats.mockResolvedValue({
    success: true,
    stats: { short: 2, normal: 5, long: 1 },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('MobileAccessDiagnosticsSection', () => {
  it('renders a collapsed toggle button initially', () => {
    render(<MobileAccessDiagnosticsSection />);
    const btn = screen.getByRole('button', { name: /diagnostics/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not fetch stats until expanded', () => {
    render(<MobileAccessDiagnosticsSection />);
    expect(mockGetTimeoutStats).not.toHaveBeenCalled();
  });

  it('fetches and shows stats when expanded', async () => {
    render(<MobileAccessDiagnosticsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /diagnostics/i }));
    });
    expect(mockGetTimeoutStats).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Short (10 s)')).toBeDefined();
    expect(screen.getByText('Normal (30 s)')).toBeDefined();
    expect(screen.getByText('Long (120 s)')).toBeDefined();
  });

  it('shows stat values from IPC response', async () => {
    render(<MobileAccessDiagnosticsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /diagnostics/i }));
    });
    // Values 2, 5, 1 from the mock
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  it('re-fetches when Refresh button clicked', async () => {
    render(<MobileAccessDiagnosticsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /diagnostics/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    });
    expect(mockGetTimeoutStats).toHaveBeenCalledTimes(2);
  });

  it('collapses when toggle clicked again', async () => {
    render(<MobileAccessDiagnosticsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /diagnostics/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /diagnostics/i }));
    });
    expect(screen.queryByText('Short (10 s)')).toBeNull();
  });

  it('shows error message when IPC fails', async () => {
    mockGetTimeoutStats.mockResolvedValue({ success: false, error: 'Stats unavailable' });
    render(<MobileAccessDiagnosticsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /diagnostics/i }));
    });
    expect(screen.getByText('Stats unavailable')).toBeDefined();
  });
});
