/**
 * MobileAccessPane.test.tsx — Integration smoke tests for the Mobile Access pane.
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../types/electron';
import { MobileAccessPane } from './MobileAccessPane';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDraft(enabled = false): AppConfig {
  return {
    mobileAccess: { enabled, pairedDevices: [] },
  } as unknown as AppConfig;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGenerate = vi.fn();
const mockList = vi.fn();
const mockRevoke = vi.fn();
const mockStats = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      mobileAccess: {
        generatePairingCode: mockGenerate,
        listPairedDevices: mockList,
        revokePairedDevice: mockRevoke,
        getTimeoutStats: mockStats,
      },
    },
  });

  mockGenerate.mockResolvedValue({
    success: true,
    code: '654321',
    expiresAt: Date.now() + 60_000,
    qrPayload: { v: 1, host: 'localhost', port: 7890, code: '654321', fingerprint: 'fp' },
  });
  mockList.mockResolvedValue({ success: true, devices: [] });
  mockRevoke.mockResolvedValue({ success: true });
  mockStats.mockResolvedValue({ success: true, stats: { short: 0, normal: 0, long: 0 } });
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MobileAccessPane', () => {
  it('renders Mobile Access heading', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft()} onChange={vi.fn()} />);
    });
    expect(screen.getByText('Mobile Access')).toBeDefined();
  });

  it('renders the enable checkbox unchecked when disabled', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(false)} onChange={vi.fn()} />);
    });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('renders the enable checkbox checked when enabled', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(true)} onChange={vi.fn()} />);
    });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('calls onChange with updated mobileAccess when toggle clicked', async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(false)} onChange={onChange} />);
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(
      'mobileAccess',
      expect.objectContaining({ enabled: true }),
    );
  });

  it('generate button calls IPC when enabled', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(true)} onChange={vi.fn()} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('generate button is disabled when mobile access is off', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(false)} onChange={vi.fn()} />);
    });
    const btn = screen.getByRole('button', { name: /generate pairing code/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows devices list section', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(true)} onChange={vi.fn()} />);
    });
    expect(screen.getByText('Paired Devices')).toBeDefined();
  });

  it('shows diagnostics toggle', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft()} onChange={vi.fn()} />);
    });
    expect(screen.getByRole('button', { name: /diagnostics/i })).toBeDefined();
  });

  it('shows pairing code after generate invoked while enabled', async () => {
    await act(async () => {
      render(<MobileAccessPane draft={makeDraft(true)} onChange={vi.fn()} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(screen.getByLabelText('Pairing code').textContent).toBe('654321');
  });
});
