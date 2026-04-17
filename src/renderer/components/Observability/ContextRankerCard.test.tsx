/**
 * @vitest-environment jsdom
 *
 * ContextRankerCard.test.tsx — Render tests for the context ranker dashboard
 * card (Wave 31 Phase F).
 *
 * Covers: loading state, error state, populated state (bundled weights,
 * trained weights), and refresh button.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextRankerDashboard } from '../../types/electron-workspace';
import { ContextRankerCard } from './ContextRankerCard';

// ─── electronAPI mock ─────────────────────────────────────────────────────────

const mockGetRankerDashboard = vi.fn();

vi.stubGlobal('electronAPI', {
  context: {
    getRankerDashboard: mockGetRankerDashboard,
  },
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDashboard(
  overrides: Partial<ContextRankerDashboard> = {},
): ContextRankerDashboard {
  return {
    version: '2024-03-01T12:00:00.000Z',
    trainedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 days ago
    auc: 0.812,
    topFeatures: [
      { name: 'pagerankScore', weight: 0.9 },
      { name: 'importDistance', weight: -0.8 },
      { name: 'recencyScore', weight: 0.7 },
      { name: 'keywordOverlap', weight: 0.6 },
      { name: 'prevUsedCount', weight: 0.5 },
    ],
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContextRankerCard — loading state', () => {
  beforeEach(() => {
    mockGetRankerDashboard.mockReturnValue(new Promise(() => undefined));
  });

  it('shows loading indicator while fetching', () => {
    render(<ContextRankerCard />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('renders the header title', () => {
    render(<ContextRankerCard />);
    expect(screen.getByText(/context ranker/i)).toBeTruthy();
  });
});

describe('ContextRankerCard — error state', () => {
  it('renders error message on IPC failure', async () => {
    mockGetRankerDashboard.mockResolvedValue({
      success: false,
      error: 'classifier not ready',
    });

    render(<ContextRankerCard />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load ranker data/i)).toBeTruthy(),
    );
    expect(screen.getByText(/classifier not ready/i)).toBeTruthy();
  });

  it('renders error message when IPC throws', async () => {
    mockGetRankerDashboard.mockRejectedValue(new Error('IPC error'));

    render(<ContextRankerCard />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load ranker data/i)).toBeTruthy(),
    );
    expect(screen.getByText(/IPC error/i)).toBeTruthy();
  });
});

describe('ContextRankerCard — bundled weights (no AUC)', () => {
  beforeEach(() => {
    mockGetRankerDashboard.mockResolvedValue({
      success: true,
      dashboard: makeDashboard({ version: 'bundled-1', auc: null }),
    });
  });

  it('shows "bundled defaults" when auc is null', async () => {
    render(<ContextRankerCard />);
    await waitFor(() =>
      expect(screen.getByText(/bundled defaults/i)).toBeTruthy(),
    );
  });

  it('renders version string', async () => {
    render(<ContextRankerCard />);
    await waitFor(() => expect(screen.getByText('bundled-1')).toBeTruthy());
  });
});

describe('ContextRankerCard — trained weights', () => {
  beforeEach(() => {
    mockGetRankerDashboard.mockResolvedValue({
      success: true,
      dashboard: makeDashboard(),
    });
  });

  it('renders the AUC value', async () => {
    render(<ContextRankerCard />);
    await waitFor(() => expect(screen.getByText('0.812')).toBeTruthy());
  });

  it('renders the version string', async () => {
    render(<ContextRankerCard />);
    await waitFor(() =>
      expect(screen.getByText('2024-03-01T12:00:00.000Z')).toBeTruthy(),
    );
  });

  it('renders Top Features section', async () => {
    render(<ContextRankerCard />);
    await waitFor(() => expect(screen.getByText(/top features/i)).toBeTruthy());
  });

  it('renders all 5 feature names', async () => {
    render(<ContextRankerCard />);
    await waitFor(() => expect(screen.getByText('pagerankScore')).toBeTruthy());
    expect(screen.getByText('importDistance')).toBeTruthy();
    expect(screen.getByText('recencyScore')).toBeTruthy();
    expect(screen.getByText('keywordOverlap')).toBeTruthy();
    expect(screen.getByText('prevUsedCount')).toBeTruthy();
  });

  it('shows relative time for trainedAt', async () => {
    render(<ContextRankerCard />);
    await waitFor(() => expect(screen.getByText(/retrained/i)).toBeTruthy());
    expect(screen.getByText(/ago|today|yesterday/i)).toBeTruthy();
  });
});

describe('ContextRankerCard — refresh', () => {
  it('fires IPC on mount', async () => {
    mockGetRankerDashboard.mockResolvedValue({
      success: true,
      dashboard: makeDashboard(),
    });
    render(<ContextRankerCard />);
    await waitFor(() => expect(mockGetRankerDashboard).toHaveBeenCalledTimes(1));
  });

  it('fires IPC again when Refresh is clicked', async () => {
    mockGetRankerDashboard.mockResolvedValue({
      success: true,
      dashboard: makeDashboard(),
    });
    render(<ContextRankerCard />);
    await waitFor(() => expect(mockGetRankerDashboard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(mockGetRankerDashboard).toHaveBeenCalledTimes(2));
  });
});
