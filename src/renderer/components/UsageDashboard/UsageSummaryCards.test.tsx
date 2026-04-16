/**
 * UsageSummaryCards.test.tsx — smoke tests for the summary card row.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UsageSummaryCards } from './UsageSummaryCards';

const baseRollup = {
  totalUsd: 3.75,
  totalInputTokens: 1_200_000,
  totalOutputTokens: 400_000,
  threadCount: 5,
};

describe('UsageSummaryCards', () => {
  afterEach(cleanup);
  it('renders four cards', () => {
    render(<UsageSummaryCards rollup={baseRollup} />);
    // Each card has a heading role via its title span
    expect(screen.getByText('Total Cost')).toBeDefined();
    expect(screen.getByText('Input Tokens')).toBeDefined();
    expect(screen.getByText('Output Tokens')).toBeDefined();
    expect(screen.getByText('Threads')).toBeDefined();
  });

  it('formats cost as dollars', () => {
    render(<UsageSummaryCards rollup={baseRollup} />);
    expect(screen.getAllByText('$3.75').length).toBeGreaterThan(0);
  });

  it('formats large token counts with appropriate suffix', () => {
    render(<UsageSummaryCards rollup={baseRollup} />);
    // formatTokenCount(1_200_000) → "1.2M"; formatTokenCount(400_000) → "400.0K"
    expect(screen.getByText('1.2M')).toBeDefined();
    expect(screen.getByText('400.0K')).toBeDefined();
  });

  it('renders thread count as plain number', () => {
    render(<UsageSummaryCards rollup={baseRollup} />);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });

  it('renders zero values when rollup is null', () => {
    render(<UsageSummaryCards rollup={null} />);
    expect(screen.getAllByText('—')).toHaveLength(4);
  });
});
