/**
 * MobileAccessPairingSection.test.tsx — Tests for the pairing code + QR section.
 * Wave 33a Phase G; Wave 43 Phase B (URL text display, not-ready error state).
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileAccessPairingSection } from './MobileAccessPairingSection';

// ── Minimal electronAPI mock ──────────────────────────────────────────────────

const mockGeneratePairingCode = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      mobileAccess: {
        generatePairingCode: mockGeneratePairingCode,
        listPairedDevices: vi.fn().mockResolvedValue({ success: true, devices: [] }),
        revokePairedDevice: vi.fn().mockResolvedValue({ success: true }),
        getTimeoutStats: vi.fn().mockResolvedValue({ success: true, stats: { short: 0, normal: 0, long: 0 } }),
      },
    },
  });

  mockGeneratePairingCode.mockResolvedValue({
    success: true,
    code: '123456',
    expiresAt: Date.now() + 60_000,
    qrPayload: { v: 1, host: 'localhost', port: 7890, code: '123456', fingerprint: 'abc' },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  cleanup();
});

describe('MobileAccessPairingSection', () => {
  it('renders the generate button', () => {
    render(<MobileAccessPairingSection enabled />);
    expect(screen.getByRole('button', { name: /generate pairing code/i })).toBeDefined();
  });

  it('button is disabled when enabled=false', () => {
    render(<MobileAccessPairingSection enabled={false} />);
    const btn = screen.getByRole('button', { name: /generate pairing code/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls generatePairingCode IPC when button clicked', async () => {
    render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(mockGeneratePairingCode).toHaveBeenCalledTimes(1);
  });

  it('shows the 6-digit code after generation', async () => {
    render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(screen.getByLabelText('Pairing code').textContent).toBe('123456');
  });

  it('renders an SVG QR code element after generation', async () => {
    const { container } = render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows expired state after TTL elapses', async () => {
    mockGeneratePairingCode.mockResolvedValue({
      success: true,
      code: '999999',
      expiresAt: Date.now() + 2_000,
      qrPayload: { v: 1, host: 'localhost', port: 7890, code: '999999', fingerprint: 'def' },
    });

    render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });

    // Advance past the 2-second TTL
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByText(/expired — regenerate/i)).toBeDefined();
  });

  it('shows error message when IPC fails', async () => {
    mockGeneratePairingCode.mockResolvedValue({ success: false, error: 'Server unavailable' });
    render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(screen.getByText('Server unavailable')).toBeDefined();
  });

  it('shows the pairing URL as copyable text below the QR after generation', async () => {
    mockGeneratePairingCode.mockResolvedValue({
      success: true,
      code: '123456',
      expiresAt: Date.now() + 60_000,
      qrPayload: { v: 1, host: '192.168.1.50', port: 7890, code: '123456', fingerprint: 'abc' },
      qrPairingUrl: 'ouroboros://pair?host=192.168.1.50&port=7890&code=123456&fingerprint=abc',
    });
    const { container } = render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    const urlInput = container.querySelector('input[aria-label="Pairing URL"]') as HTMLInputElement | null;
    expect(urlInput).not.toBeNull();
    expect(urlInput?.value).toContain('192.168.1.50');
    expect(urlInput?.readOnly).toBe(true);
  });

  it('shows retry button and hint when server is not ready', async () => {
    mockGeneratePairingCode.mockResolvedValue({
      success: false,
      error: 'Web server not ready — try again in a moment',
    });
    render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
    expect(screen.getByText(/not ready/i)).toBeDefined();
    // QR should NOT be rendered in not-ready state
    expect(screen.queryByLabelText('Pairing URL')).toBeNull();
  });

  it('does not show generic error paragraph for not-ready errors', async () => {
    mockGeneratePairingCode.mockResolvedValue({
      success: false,
      error: 'Web server not ready — try again in a moment',
    });
    render(<MobileAccessPairingSection enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
    });
    // The not-ready path shows a warning hint, not a generic error paragraph
    expect(screen.queryByText('Web server not ready — try again in a moment')).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
  });
});
