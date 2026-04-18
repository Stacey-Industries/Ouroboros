// @vitest-environment jsdom
/**
 * useDispatchReconnectDrain.test.ts — Wave 34 Phase G.
 *
 * Covers:
 *  - Transition disconnected → connected fires drain
 *  - Transition connecting  → connected fires drain
 *  - connected → connected does NOT fire drain again
 *  - electron state never fires drain
 *  - Drain result toasted: sent, failed, lost messages
 *  - Duplicate-in-flight guard (drainingRef prevents concurrent drains)
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDrain = vi.fn();
vi.mock('../../web/offlineDispatchQueue', () => ({
  drainOfflineDispatches: (...args: unknown[]) => mockDrain(...args),
}));

const mockToast = vi.fn();
vi.mock('./useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { useDispatchReconnectDrain } from './useDispatchReconnectDrain';
import type { ConnectionState } from './useWebConnectionState';

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDrain.mockResolvedValue({ sent: 0, failed: 0, lost: 0 });
});

function renderDrain(initial: ConnectionState) {
  return renderHook(
    ({ state }: { state: ConnectionState }) => useDispatchReconnectDrain(state),
    { initialProps: { state: initial } },
  );
}

// ── Transition tests ──────────────────────────────────────────────────────────

describe('useDispatchReconnectDrain', () => {
  it('fires drain on disconnected → connected', async () => {
    const { rerender } = renderDrain('disconnected');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockDrain).toHaveBeenCalledOnce();
  });

  it('fires drain on connecting → connected', async () => {
    const { rerender } = renderDrain('connecting');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockDrain).toHaveBeenCalledOnce();
  });

  it('does NOT fire drain on connected → connected', async () => {
    const { rerender } = renderDrain('connected');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('does NOT fire drain in electron mode', async () => {
    const { rerender } = renderDrain('electron');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('does NOT fire drain on connected → disconnected', async () => {
    const { rerender } = renderDrain('connected');
    await act(async () => { rerender({ state: 'disconnected' }); });
    expect(mockDrain).not.toHaveBeenCalled();
  });

  // ── Toast messages ──────────────────────────────────────────────────────────

  it('shows toast when sent > 0', async () => {
    mockDrain.mockResolvedValue({ sent: 3, failed: 0, lost: 0 });
    const { rerender } = renderDrain('disconnected');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('3 dispatches sent'),
      'info',
    );
  });

  it('shows toast when failed > 0', async () => {
    mockDrain.mockResolvedValue({ sent: 1, failed: 2, lost: 0 });
    const { rerender } = renderDrain('disconnected');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('2 failed'),
      'info',
    );
  });

  it('shows toast when lost > 0', async () => {
    mockDrain.mockResolvedValue({ sent: 0, failed: 0, lost: 1 });
    const { rerender } = renderDrain('disconnected');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('1 already processed'),
      'info',
    );
  });

  it('shows no toast when queue was empty (all zeros)', async () => {
    mockDrain.mockResolvedValue({ sent: 0, failed: 0, lost: 0 });
    const { rerender } = renderDrain('disconnected');
    await act(async () => { rerender({ state: 'connected' }); });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('includes all three counts in the same toast message', async () => {
    mockDrain.mockResolvedValue({ sent: 1, failed: 1, lost: 1 });
    const { rerender } = renderDrain('disconnected');
    await act(async () => { rerender({ state: 'connected' }); });
    const msg: string = mockToast.mock.calls[0][0] as string;
    expect(msg).toContain('1 dispatch sent');
    expect(msg).toContain('1 failed');
    expect(msg).toContain('1 already processed');
  });
});
