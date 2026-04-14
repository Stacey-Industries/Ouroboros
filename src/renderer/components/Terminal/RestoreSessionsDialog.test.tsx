/**
 * @vitest-environment jsdom
 *
 * RestoreSessionsDialog — render + interaction smoke tests
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

import type { PersistedSessionInfo } from '../../types/electron';
import { RestoreSessionsDialog } from './RestoreSessionsDialog';

function makeSession(overrides: Partial<PersistedSessionInfo> = {}): PersistedSessionInfo {
  return {
    id: 'session-1',
    cwd: '/home/user/project',
    shellPath: '/bin/zsh',
    cols: 80,
    rows: 24,
    createdAt: Date.now() - 1000,
    lastSeenAt: Date.now() - 1000,
    ...overrides,
  };
}

const defaultProps = {
  sessions: [makeSession({ id: 'a', cwd: '/home/user/alpha' }), makeSession({ id: 'b', cwd: '/home/user/beta' })],
  onRestoreAll: vi.fn(),
  onRestoreSelected: vi.fn(),
  onDiscard: vi.fn(),
  onDismiss: vi.fn(),
};

describe('RestoreSessionsDialog', () => {
  it('renders the dialog title and session count', () => {
    render(<RestoreSessionsDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Restore previous terminals?')).toBeDefined();
    expect(screen.getByText(/Ouroboros saved 2 terminal sessions/)).toBeDefined();
  });

  it('lists all sessions as checked checkboxes by default', () => {
    render(<RestoreSessionsDialog {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => expect(cb.checked).toBe(true));
  });

  it('calls onRestoreAll when "Restore all" button is clicked', () => {
    const onRestoreAll = vi.fn();
    render(<RestoreSessionsDialog {...defaultProps} onRestoreAll={onRestoreAll} />);
    fireEvent.click(screen.getByText(/Restore all/));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
  });

  it('calls onRestoreSelected with selected ids', () => {
    const onRestoreSelected = vi.fn();
    render(<RestoreSessionsDialog {...defaultProps} onRestoreSelected={onRestoreSelected} />);
    // Uncheck first session
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByText(/Restore selected/));
    expect(onRestoreSelected).toHaveBeenCalledWith(['b']);
  });

  it('disables "Restore selected" when nothing is checked', () => {
    const onRestoreSelected = vi.fn();
    render(<RestoreSessionsDialog {...defaultProps} onRestoreSelected={onRestoreSelected} />);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // Uncheck all
    checkboxes.forEach((cb) => fireEvent.click(cb));
    const btn = screen.getByText(/Restore selected/) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls onDiscard when "Discard all" is clicked', () => {
    const onDiscard = vi.fn();
    render(<RestoreSessionsDialog {...defaultProps} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByText('Discard all'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<RestoreSessionsDialog {...defaultProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Not now'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders singular wording for a single session', () => {
    const props = { ...defaultProps, sessions: [makeSession()] };
    render(<RestoreSessionsDialog {...props} />);
    expect(screen.getByText(/Ouroboros saved 1 terminal session from/)).toBeDefined();
  });
});
