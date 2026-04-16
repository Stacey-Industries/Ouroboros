/**
 * ThreadCostTable.test.tsx — smoke tests for the per-thread cost table.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThreadCostTable } from './ThreadCostTable';

const rows = [
  { threadId: 'aaa-111', inputTokens: 1000, outputTokens: 500, totalUsd: 0.02 },
  { threadId: 'bbb-222', inputTokens: 5000, outputTokens: 2000, totalUsd: 0.15 },
  { threadId: 'ccc-333', inputTokens: 200, outputTokens: 100, totalUsd: 0.005 },
];

describe('ThreadCostTable', () => {
  afterEach(cleanup);
  it('renders column headers', () => {
    render(<ThreadCostTable threads={rows} />);
    expect(screen.getByText(/thread/i)).toBeDefined();
    expect(screen.getByText(/input/i)).toBeDefined();
    expect(screen.getByText(/output/i)).toBeDefined();
    expect(screen.getByText(/cost/i)).toBeDefined();
  });

  it('renders one row per thread', () => {
    render(<ThreadCostTable threads={rows} />);
    // Each thread ID appears exactly once (one cell per row)
    expect(screen.getAllByText('aaa-111')).toHaveLength(1);
    expect(screen.getAllByText('bbb-222')).toHaveLength(1);
    expect(screen.getAllByText('ccc-333')).toHaveLength(1);
  });

  it('sorts by cost descending by default', () => {
    render(<ThreadCostTable threads={rows} />);
    const cells = screen.getAllByRole('cell');
    // First data row should be bbb-222 (highest cost)
    expect(cells[0].textContent).toContain('bbb-222');
  });

  it('toggles sort to ascending on second click of same column', () => {
    render(<ThreadCostTable threads={rows} />);
    const costHeader = screen.getByRole('columnheader', { name: /cost/i });
    // First click: already desc, goes to asc
    fireEvent.click(costHeader);
    const cells = screen.getAllByRole('cell');
    // Lowest cost first (ccc-333 at $0.005)
    expect(cells[0].textContent).toContain('ccc-333');
  });

  it('renders empty state when threads is empty', () => {
    render(<ThreadCostTable threads={[]} />);
    expect(screen.getByText(/no threads/i)).toBeDefined();
  });

  it('sorts by inputTokens when that header is clicked', () => {
    render(<ThreadCostTable threads={rows} />);
    const inputHeader = screen.getByRole('columnheader', { name: /input/i });
    fireEvent.click(inputHeader);
    const cells = screen.getAllByRole('cell');
    // Descending by input: bbb-222 (5000) first
    expect(cells[0].textContent).toContain('bbb-222');
  });
});
