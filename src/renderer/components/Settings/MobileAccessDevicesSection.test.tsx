/**
 * MobileAccessDevicesSection.test.tsx — Tests for paired devices list + revoke.
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PairedDeviceInfo } from '../../types/electron-mobile-access';
import { formatLastSeen, MobileAccessDevicesSection } from './MobileAccessDevicesSection';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDevice(overrides: Partial<PairedDeviceInfo> = {}): PairedDeviceInfo {
  return {
    id: 'dev-1',
    label: 'iPhone 15',
    fingerprint: 'fp-abc',
    capabilities: ['paired-read', 'paired-write'],
    issuedAt: new Date(Date.now() - 3_600_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockList = vi.fn();
const mockRevoke = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      mobileAccess: {
        generatePairingCode: vi.fn(),
        listPairedDevices: mockList,
        revokePairedDevice: mockRevoke,
        getTimeoutStats: vi.fn().mockResolvedValue({ success: true, stats: { short: 0, normal: 0, long: 0 } }),
      },
    },
  });

  mockList.mockResolvedValue({ success: true, devices: [] });
  mockRevoke.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── formatLastSeen unit tests ─────────────────────────────────────────────────

describe('formatLastSeen', () => {
  it('returns "just now" for sub-minute timestamps', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(formatLastSeen(recent)).toBe('just now');
  });

  it('returns "X min ago" for < 1 hour', () => {
    const ts = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatLastSeen(ts)).toBe('5 min ago');
  });

  it('returns "X h ago" for < 24 hours', () => {
    const ts = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatLastSeen(ts)).toBe('3 h ago');
  });

  it('returns "yesterday" for ~1 day ago', () => {
    const ts = new Date(Date.now() - 25 * 3_600_000).toISOString();
    expect(formatLastSeen(ts)).toBe('yesterday');
  });

  it('returns "X d ago" for multiple days', () => {
    const ts = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(formatLastSeen(ts)).toBe('5 d ago');
  });
});

// ── Component tests ───────────────────────────────────────────────────────────

describe('MobileAccessDevicesSection', () => {
  it('shows empty state when no devices', async () => {
    mockList.mockResolvedValue({ success: true, devices: [] });
    await act(async () => {
      render(<MobileAccessDevicesSection enabled />);
    });
    expect(screen.getByText('No paired devices yet.')).toBeDefined();
  });

  it('renders device label and last-seen', async () => {
    mockList.mockResolvedValue({ success: true, devices: [makeDevice()] });
    await act(async () => {
      render(<MobileAccessDevicesSection enabled />);
    });
    expect(screen.getByText('iPhone 15')).toBeDefined();
    expect(screen.getByText(/last seen:/i)).toBeDefined();
  });

  it('renders capability badges', async () => {
    mockList.mockResolvedValue({ success: true, devices: [makeDevice()] });
    await act(async () => {
      render(<MobileAccessDevicesSection enabled />);
    });
    expect(screen.getByText('paired-read')).toBeDefined();
    expect(screen.getByText('paired-write')).toBeDefined();
  });

  it('calls revokePairedDevice when revoke button clicked', async () => {
    mockList.mockResolvedValue({ success: true, devices: [makeDevice()] });
    await act(async () => {
      render(<MobileAccessDevicesSection enabled />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke iphone 15/i }));
    });
    expect(mockRevoke).toHaveBeenCalledWith('dev-1');
  });

  it('removes device from list after successful revoke', async () => {
    mockList.mockResolvedValue({ success: true, devices: [makeDevice()] });
    await act(async () => {
      render(<MobileAccessDevicesSection enabled />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke iphone 15/i }));
    });
    expect(screen.queryByText('iPhone 15')).toBeNull();
    expect(screen.getByText('No paired devices yet.')).toBeDefined();
  });

  it('shows disabled notice when enabled=false', async () => {
    await act(async () => {
      render(<MobileAccessDevicesSection enabled={false} />);
    });
    expect(screen.getByText(/enable mobile access/i)).toBeDefined();
  });

  it('shows error when listPairedDevices fails', async () => {
    mockList.mockResolvedValue({ success: false, error: 'IPC error' });
    await act(async () => {
      render(<MobileAccessDevicesSection enabled />);
    });
    expect(screen.getByText('IPC error')).toBeDefined();
  });
});
