/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerminalDisconnectedBanner } from './TerminalDisconnectedBanner';

afterEach(() => cleanup());

function makeInfo(overrides: Partial<{ reason: string; exitCode: number; scrollback: string[] }> = {}) {
  return {
    reason: 'ptyhost-crashed',
    exitCode: 137,
    scrollback: ['$ echo hello', 'hello', '$ '],
    ...overrides,
  };
}

describe('TerminalDisconnectedBanner', () => {
  it('renders the disconnected title and exit code', () => {
    render(
      <TerminalDisconnectedBanner
        info={makeInfo()}
        onRestart={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Terminal disconnected')).toBeDefined();
    expect(screen.getByText(/code 137/)).toBeDefined();
  });

  it('renders the scrollback as joined lines', () => {
    render(
      <TerminalDisconnectedBanner
        info={makeInfo({ scrollback: ['line one', 'line two', 'line three'] })}
        onRestart={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const pre = screen.getByTestId('terminal-disconnected-scrollback');
    expect(pre.textContent).toContain('line one');
    expect(pre.textContent).toContain('line two');
    expect(pre.textContent).toContain('line three');
  });

  it('shows placeholder when scrollback is empty', () => {
    render(
      <TerminalDisconnectedBanner
        info={makeInfo({ scrollback: [] })}
        onRestart={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('(no scrollback captured)')).toBeDefined();
  });

  it('calls onRestart when "New terminal" is clicked', () => {
    const onRestart = vi.fn();
    render(
      <TerminalDisconnectedBanner
        info={makeInfo()}
        onRestart={onRestart}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('New terminal'));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when "Dismiss" is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <TerminalDisconnectedBanner
        info={makeInfo()}
        onRestart={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders as an alert for screen readers', () => {
    render(
      <TerminalDisconnectedBanner
        info={makeInfo()}
        onRestart={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
