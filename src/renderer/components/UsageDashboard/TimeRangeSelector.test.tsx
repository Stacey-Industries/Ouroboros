/**
 * TimeRangeSelector.test.tsx — smoke tests for the time range dropdown.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimeRangeSelector } from './TimeRangeSelector';

describe('TimeRangeSelector', () => {
  afterEach(cleanup);
  it('renders a select with all three options', () => {
    render(<TimeRangeSelector value="all" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /time range/i });
    expect(select).toBeDefined();
    expect(screen.getByText('Last 7 days')).toBeDefined();
    expect(screen.getByText('Last 30 days')).toBeDefined();
    expect(screen.getByText('All time')).toBeDefined();
  });

  it('reflects the current value', () => {
    render(<TimeRangeSelector value="7d" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /time range/i }) as HTMLSelectElement;
    expect(select.value).toBe('7d');
  });

  it('calls onChange with the selected key', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value="all" onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: /time range/i });
    fireEvent.change(select, { target: { value: '30d' } });
    expect(onChange).toHaveBeenCalledWith('30d');
  });
});
