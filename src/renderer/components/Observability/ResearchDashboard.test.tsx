/**
 * @vitest-environment jsdom
 *
 * ResearchDashboard.test.tsx — Render tests for the research metrics dashboard
 * (Wave 30 Phase H).
 *
 * Covers: loading state, empty state, populated state (all cards), error state,
 * and range button triggering a fresh IPC call.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResearchDashboardMetrics } from '../../types/electron-research';
import { ResearchDashboard } from './ResearchDashboard';

// ─── electronAPI mock ─────────────────────────────────────────────────────────

const mockGetDashboardMetrics = vi.fn();

vi.stubGlobal('electronAPI', {
  research: {
    getDashboardMetrics: mockGetDashboardMetrics,
  },
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<ResearchDashboardMetrics> = {}): ResearchDashboardMetrics {
  return {
    range: '7d',
    window: { fromIso: '2026-04-10T00:00:00.000Z', toIso: '2026-04-17T00:00:00.000Z' },
    invocations: {
      total: 42,
      byTrigger: { hook: 20, 'fact-claim': 10, slash: 5, correction: 4, other: 3 },
      cacheHitRate: 0.6,
      avgLatencyMs: 320,
      p95LatencyMs: 780,
    },
    outcomes: {
      total: 30,
      accepted: 22,
      reverted: 5,
      unknown: 3,
      acceptanceRate: 22 / 27,
    },
    correlated: {
      firedCount: 42,
      outcomeCorrelatedCount: 27,
      falsePositiveCount: 5,
      falsePositiveRate: 5 / 42,
    },
    corrections: {
      total: 8,
      enhancedLibrariesCount: 3,
    },
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResearchDashboard — loading state', () => {
  beforeEach(() => {
    // Never resolves during the test
    mockGetDashboardMetrics.mockReturnValue(new Promise(() => undefined));
  });

  it('shows loading indicator while fetching', () => {
    render(<ResearchDashboard />);
    expect(screen.getByText(/loading metrics/i)).toBeTruthy();
  });

  it('renders the range tab bar', () => {
    render(<ResearchDashboard />);
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('30 days')).toBeTruthy();
    expect(screen.getByText('All time')).toBeTruthy();
  });
});

describe('ResearchDashboard — error state', () => {
  it('renders error message on IPC failure', async () => {
    mockGetDashboardMetrics.mockResolvedValue({
      success: false,
      error: 'DB connection failed',
    });

    render(<ResearchDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load metrics/i)).toBeTruthy(),
    );
    expect(screen.getByText(/DB connection failed/i)).toBeTruthy();
  });

  it('renders error message when IPC throws', async () => {
    mockGetDashboardMetrics.mockRejectedValue(new Error('IPC timeout'));

    render(<ResearchDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load metrics/i)).toBeTruthy(),
    );
    expect(screen.getByText(/IPC timeout/i)).toBeTruthy();
  });
});

describe('ResearchDashboard — empty state', () => {
  it('shows empty message when total invocations is zero', async () => {
    const emptyMetrics = makeMetrics({
      invocations: {
        total: 0,
        byTrigger: { hook: 0, 'fact-claim': 0, slash: 0, correction: 0, other: 0 },
        cacheHitRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
      },
    });
    mockGetDashboardMetrics.mockResolvedValue({ success: true, metrics: emptyMetrics });

    render(<ResearchDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/no research invocations recorded/i)).toBeTruthy(),
    );
  });
});

describe('ResearchDashboard — populated state', () => {
  beforeEach(() => {
    mockGetDashboardMetrics.mockResolvedValue({
      success: true,
      metrics: makeMetrics(),
    });
  });

  it('renders invocations card with total count', async () => {
    render(<ResearchDashboard />);
    await waitFor(() => expect(screen.getAllByText('42').length).toBeGreaterThan(0));
    expect(screen.getByText(/invocations/i)).toBeTruthy();
  });

  it('renders cache hit rate card', async () => {
    render(<ResearchDashboard />);
    await waitFor(() => expect(screen.getByText('60%')).toBeTruthy());
    expect(screen.getByText(/cache hit rate/i)).toBeTruthy();
  });

  it('renders latency card with avg and p95', async () => {
    render(<ResearchDashboard />);
    await waitFor(() => expect(screen.getByText('320')).toBeTruthy());
    expect(screen.getByText(/780 ms/i)).toBeTruthy();
  });

  it('renders outcomes card with acceptance rate', async () => {
    render(<ResearchDashboard />);
    await waitFor(() => expect(screen.getByText(/outcomes/i)).toBeTruthy());
    // acceptance = 22/27 ≈ 81%
    expect(screen.getByText('81%')).toBeTruthy();
  });

  it('renders correlation card with FP rate', async () => {
    render(<ResearchDashboard />);
    await waitFor(() => expect(screen.getByText(/correlation/i)).toBeTruthy());
    // FP rate = 5/42 ≈ 11.9% → rounds to 12%
    expect(screen.getByText('12%')).toBeTruthy();
  });

  it('renders corrections card with library count', async () => {
    render(<ResearchDashboard />);
    await waitFor(() => expect(screen.getByText(/corrections/i)).toBeTruthy());
    expect(screen.getByText('8')).toBeTruthy();
    // unique libraries sub-stat
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });
});

describe('ResearchDashboard — range selection', () => {
  it('fires IPC with 7d on mount', async () => {
    mockGetDashboardMetrics.mockResolvedValue({ success: true, metrics: makeMetrics() });
    render(<ResearchDashboard />);
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledWith('7d'));
  });

  it('fires IPC with 30d when 30-day tab is clicked', async () => {
    mockGetDashboardMetrics.mockResolvedValue({ success: true, metrics: makeMetrics() });
    render(<ResearchDashboard />);
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('30 days'));
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledWith('30d'));
  });

  it('fires IPC with all when All time tab is clicked', async () => {
    mockGetDashboardMetrics.mockResolvedValue({ success: true, metrics: makeMetrics() });
    render(<ResearchDashboard />);
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('All time'));
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledWith('all'));
  });

  it('fires IPC again on Refresh click', async () => {
    mockGetDashboardMetrics.mockResolvedValue({ success: true, metrics: makeMetrics() });
    render(<ResearchDashboard />);
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(mockGetDashboardMetrics).toHaveBeenCalledTimes(2));
  });
});
