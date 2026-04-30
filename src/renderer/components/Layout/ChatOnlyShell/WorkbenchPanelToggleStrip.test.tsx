/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RightPaneToggleButton, TerminalToggleButton } from './WorkbenchPanelToggleStrip';

afterEach(cleanup);

describe('TerminalToggleButton', () => {
  it('renders with the correct testid', () => {
    render(<TerminalToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-terminal')).toBeDefined();
  });

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<TerminalToggleButton open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-terminal'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('reflects open state via aria-pressed and label', () => {
    const { rerender } = render(<TerminalToggleButton open={true} onToggle={vi.fn()} />);
    const btn = screen.getByTestId('workbench-toggle-terminal');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('title')).toBe('Hide terminal');
    rerender(<TerminalToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-terminal').getAttribute('title')).toBe(
      'Show terminal',
    );
  });
});

describe('RightPaneToggleButton', () => {
  it('renders with the correct testid', () => {
    render(<RightPaneToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-right-pane')).toBeDefined();
  });

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<RightPaneToggleButton open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-right-pane'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('reflects open state via aria-pressed and label', () => {
    const { rerender } = render(<RightPaneToggleButton open={true} onToggle={vi.fn()} />);
    const btn = screen.getByTestId('workbench-toggle-right-pane');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('title')).toBe('Hide right pane');
    rerender(<RightPaneToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-right-pane').getAttribute('title')).toBe(
      'Show right pane',
    );
  });
});
