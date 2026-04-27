/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchRailToggleButton } from './WorkbenchRailToggle';

afterEach(() => {
  cleanup();
});

describe('WorkbenchRailToggleButton', () => {
  it('renders with correct label when rail is open', () => {
    render(<WorkbenchRailToggleButton railOpen={true} onToggle={vi.fn()} />);
    const btn = screen.getByTestId('workbench-rail-toggle');
    expect(btn.getAttribute('aria-label')).toBe('Hide workbench rail');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders with correct label when rail is closed', () => {
    render(<WorkbenchRailToggleButton railOpen={false} onToggle={vi.fn()} />);
    const btn = screen.getByTestId('workbench-rail-toggle');
    expect(btn.getAttribute('aria-label')).toBe('Show workbench rail');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<WorkbenchRailToggleButton railOpen={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('workbench-rail-toggle'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
