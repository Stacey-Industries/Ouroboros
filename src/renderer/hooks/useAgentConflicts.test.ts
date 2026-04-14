/**
 * @vitest-environment jsdom
 *
 * useAgentConflicts.test.ts — Unit tests for the useAgentConflicts hook.
 *
 * Verifies subscription setup, initial fetch, snapshot filtering by sessionId,
 * and cleanup on unmount.
 */

import type { AgentConflictReport, AgentConflictSnapshot } from '@shared/types/agentConflict';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentConflicts } from './useAgentConflicts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReport(sessionA: string, sessionB: string): AgentConflictReport {
  return {
    sessionA,
    sessionB,
    overlappingSymbols: [],
    overlappingFiles: ['src/foo.ts'],
    severity: 'warning',
    updatedAt: Date.now(),
    fileOnly: true,
  };
}

function makeSnapshot(reports: AgentConflictReport[]): AgentConflictSnapshot {
  return { reports, sessionFiles: {} };
}

// ── Mock window.electronAPI ───────────────────────────────────────────────────

const mockCleanup = vi.fn();
let capturedOnChangeCallback: ((s: AgentConflictSnapshot) => void) | null = null;

const mockGetReports = vi.fn().mockResolvedValue({ success: true, snapshot: makeSnapshot([]) });
const mockOnChange = vi.fn((cb: (s: AgentConflictSnapshot) => void) => {
  capturedOnChangeCallback = cb;
  return mockCleanup;
});
const mockDismiss = vi.fn().mockResolvedValue({ success: true });

function setupElectronAPI(): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      agentConflict: {
        getReports: mockGetReports,
        onChange: mockOnChange,
        dismiss: mockDismiss,
      },
    },
  });
}

function teardownElectronAPI(): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAgentConflicts', () => {
  beforeEach(() => {
    capturedOnChangeCallback = null;
    vi.clearAllMocks();
    setupElectronAPI();
  });

  afterEach(() => {
    cleanup();
    teardownElectronAPI();
  });

  it('subscribes to onChange on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useAgentConflicts('sess1'));
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('fetches initial snapshot on mount', async () => {
    const report = makeReport('sess1', 'sess2');
    mockGetReports.mockResolvedValueOnce({ success: true, snapshot: makeSnapshot([report]) });

    const { result } = renderHook(() => useAgentConflicts('sess1'));

    // Wait for the async getReports to settle
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0].sessionA).toBe('sess1');
  });

  it('returns all reports when sessionId is undefined', async () => {
    const reports = [makeReport('sessA', 'sessB'), makeReport('sessC', 'sessD')];
    mockGetReports.mockResolvedValueOnce({ success: true, snapshot: makeSnapshot(reports) });

    const { result } = renderHook(() => useAgentConflicts(undefined));
    await act(async () => { await Promise.resolve(); });

    expect(result.current.reports).toHaveLength(2);
  });

  it('filters reports to only those involving the given sessionId', async () => {
    const reports = [
      makeReport('sessA', 'sessB'),
      makeReport('sessC', 'sessD'),
    ];
    mockGetReports.mockResolvedValueOnce({ success: true, snapshot: makeSnapshot(reports) });

    const { result } = renderHook(() => useAgentConflicts('sessA'));
    await act(async () => { await Promise.resolve(); });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0]).toMatchObject({ sessionA: 'sessA', sessionB: 'sessB' });
  });

  it('updates reports when onChange fires', async () => {
    const { result } = renderHook(() => useAgentConflicts('sess1'));
    await act(async () => { await Promise.resolve(); });

    const newReport = makeReport('sess1', 'sess2');
    act(() => {
      capturedOnChangeCallback?.(makeSnapshot([newReport]));
    });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.snapshot?.reports[0].sessionB).toBe('sess2');
  });

  it('returns empty reports when snapshot is null', () => {
    const { result } = renderHook(() => useAgentConflicts('sess1'));
    expect(result.current.reports).toEqual([]);
    expect(result.current.snapshot).toBeNull();
  });

  it('handles missing electronAPI gracefully', () => {
    teardownElectronAPI();
    const { result } = renderHook(() => useAgentConflicts('sess1'));
    expect(result.current.reports).toEqual([]);
    expect(result.current.snapshot).toBeNull();
  });
});
