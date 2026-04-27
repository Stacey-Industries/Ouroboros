/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchPanelToggleStrip } from './WorkbenchPanelToggleStrip';

function makeProps(overrides: Partial<React.ComponentProps<typeof WorkbenchPanelToggleStrip>> = {}) {
  return {
    terminalOpen: false,
    onToggleTerminal: vi.fn(),
    utilityOpen: false,
    onToggleUtility: vi.fn(),
    artifactOpen: false,
    onToggleArtifact: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('WorkbenchPanelToggleStrip', () => {
  it('renders all three toggle buttons', () => {
    render(<WorkbenchPanelToggleStrip {...makeProps()} />);
    expect(screen.getByTestId('workbench-toggle-terminal')).toBeDefined();
    expect(screen.getByTestId('workbench-toggle-utility')).toBeDefined();
    expect(screen.getByTestId('workbench-toggle-artifact')).toBeDefined();
  });

  it('calls onToggleTerminal when terminal button is clicked', () => {
    const onToggleTerminal = vi.fn();
    render(<WorkbenchPanelToggleStrip {...makeProps({ onToggleTerminal })} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-terminal'));
    expect(onToggleTerminal).toHaveBeenCalledOnce();
  });

  it('calls onToggleUtility when utility button is clicked', () => {
    const onToggleUtility = vi.fn();
    render(<WorkbenchPanelToggleStrip {...makeProps({ onToggleUtility })} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-utility'));
    expect(onToggleUtility).toHaveBeenCalledOnce();
  });

  it('calls onToggleArtifact when artifact button is clicked', () => {
    const onToggleArtifact = vi.fn();
    render(<WorkbenchPanelToggleStrip {...makeProps({ onToggleArtifact })} />);
    fireEvent.click(screen.getByTestId('workbench-toggle-artifact'));
    expect(onToggleArtifact).toHaveBeenCalledOnce();
  });

  it('sets aria-pressed=true on terminal button when terminalOpen is true', () => {
    render(<WorkbenchPanelToggleStrip {...makeProps({ terminalOpen: true })} />);
    const btn = screen.getByTestId('workbench-toggle-terminal');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed=false on utility button when utilityOpen is false', () => {
    render(<WorkbenchPanelToggleStrip {...makeProps({ utilityOpen: false })} />);
    const btn = screen.getByTestId('workbench-toggle-utility');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows "Hide artifact pane" label when artifactOpen is true', () => {
    render(<WorkbenchPanelToggleStrip {...makeProps({ artifactOpen: true })} />);
    expect(screen.getByTestId('workbench-toggle-artifact').getAttribute('aria-label')).toBe(
      'Hide artifact pane',
    );
  });

  it('shows "Show terminal" label when terminalOpen is false', () => {
    render(<WorkbenchPanelToggleStrip {...makeProps({ terminalOpen: false })} />);
    expect(screen.getByTestId('workbench-toggle-terminal').getAttribute('aria-label')).toBe(
      'Show terminal',
    );
  });
});
