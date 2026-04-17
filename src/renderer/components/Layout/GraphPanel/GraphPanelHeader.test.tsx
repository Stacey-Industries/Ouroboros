/**
 * GraphPanelHeader.test.tsx — smoke tests for the graph toolbar.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphPanelHeader } from './GraphPanelHeader';

afterEach(cleanup);

function defaultProps(overrides: Partial<Parameters<typeof GraphPanelHeader>[0]> = {}) {
  return {
    scale: 1,
    filter: '',
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetView: vi.fn(),
    onFilterChange: vi.fn(),
    ...overrides,
  };
}

describe('GraphPanelHeader', () => {
  it('renders zoom percentage label from scale prop', () => {
    render(<GraphPanelHeader {...defaultProps({ scale: 0.75 })} />);
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('calls onZoomIn when + button is clicked', () => {
    const onZoomIn = vi.fn();
    render(<GraphPanelHeader {...defaultProps({ onZoomIn })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onZoomIn).toHaveBeenCalledOnce();
  });

  it('calls onZoomOut when − button is clicked', () => {
    const onZoomOut = vi.fn();
    render(<GraphPanelHeader {...defaultProps({ onZoomOut })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it('calls onResetView when reset button is clicked', () => {
    const onResetView = vi.fn();
    render(<GraphPanelHeader {...defaultProps({ onResetView })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(onResetView).toHaveBeenCalledOnce();
  });

  it('calls onFilterChange with input value', () => {
    const onFilterChange = vi.fn();
    render(<GraphPanelHeader {...defaultProps({ onFilterChange })} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'MyClass' } });
    expect(onFilterChange).toHaveBeenCalledWith('MyClass');
  });

  it('displays current filter value in the input', () => {
    render(<GraphPanelHeader {...defaultProps({ filter: 'hello' })} />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('hello');
  });
});
