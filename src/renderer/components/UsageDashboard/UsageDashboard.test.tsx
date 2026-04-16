/**
 * UsageDashboard.test.tsx — smoke tests for the top-level dashboard panel.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsageDashboard } from './UsageDashboard';

function stubElectronAPI(result: unknown): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      agentChat: {
        getGlobalCostRollup: vi.fn().mockResolvedValue(result),
      },
    },
  });
}

describe('UsageDashboard', () => {
  beforeEach(() => {
    stubElectronAPI({
      success: true,
      rollup: {
        totalUsd: 2.0,
        totalInputTokens: 500_000,
        totalOutputTokens: 200_000,
        threadCount: 3,
      },
      threads: [
        { threadId: 'x-1', inputTokens: 300_000, outputTokens: 120_000, totalUsd: 1.2 },
        { threadId: 'x-2', inputTokens: 200_000, outputTokens: 80_000, totalUsd: 0.8 },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the panel heading', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('Usage Dashboard')).toBeDefined();
  });

  it('renders the time range selector', () => {
    render(<UsageDashboard />);
    expect(screen.getAllByRole('combobox', { name: /time range/i }).length).toBeGreaterThan(0);
  });

  it('renders a loading indicator initially', () => {
    render(<UsageDashboard />);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it('shows summary cards after data loads', async () => {
    const { findByText, getAllByText } = render(<UsageDashboard />);
    await findByText('Total Cost');
    expect(getAllByText('Input Tokens').length).toBeGreaterThan(0);
  });

  it('shows thread table after data loads', async () => {
    const { findByText } = render(<UsageDashboard />);
    await findByText('x-1');
  });

  it('shows error message on IPC failure', async () => {
    stubElectronAPI({ success: false, error: 'DB unavailable' });
    const { findByText } = render(<UsageDashboard />);
    await findByText(/DB unavailable/i);
  });
});
