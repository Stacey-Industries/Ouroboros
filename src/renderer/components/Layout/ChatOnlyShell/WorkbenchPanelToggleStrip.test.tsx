/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ArtifactPaneToggleButton,
  RightPaneToggleButton,
  TerminalToggleButton,
  UtilityPaneToggleButton,
} from './WorkbenchPanelToggleStrip';

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

describe('UtilityPaneToggleButton', () => {
  it('renders with the correct testid', () => {
    render(<UtilityPaneToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-utility-pane')).toBeDefined();
  });

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<UtilityPaneToggleButton open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-utility-pane'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('reflects open state via aria-pressed', () => {
    const { rerender } = render(<UtilityPaneToggleButton open={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-utility-pane').getAttribute('aria-pressed')).toBe(
      'true',
    );
    rerender(<UtilityPaneToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-utility-pane').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('label describes the utility panel surface', () => {
    render(<UtilityPaneToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-utility-pane').getAttribute('title')).toBe(
      'Show utility panel',
    );
  });
});

describe('ArtifactPaneToggleButton', () => {
  it('renders with the correct testid', () => {
    render(<ArtifactPaneToggleButton open={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-artifact-pane')).toBeDefined();
  });

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ArtifactPaneToggleButton open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-artifact-pane'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('reflects open state via aria-pressed independent of utility button', () => {
    render(
      <>
        <UtilityPaneToggleButton open={true} onToggle={vi.fn()} />
        <ArtifactPaneToggleButton open={false} onToggle={vi.fn()} />
      </>,
    );
    expect(screen.getByTestId('workbench-toggle-utility-pane').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('workbench-toggle-artifact-pane').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('label describes the artifact panel surface', () => {
    render(<ArtifactPaneToggleButton open={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId('workbench-toggle-artifact-pane').getAttribute('title')).toBe(
      'Hide artifact panel',
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
