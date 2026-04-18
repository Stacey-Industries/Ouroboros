/**
 * DispatchForm.parts.test.tsx — tests for WorktreeFields sub-component.
 *
 * Covers:
 * - Toggle renders; checkbox is unchecked by default
 * - Name input is hidden when toggle is off
 * - Name input appears when toggle is on
 * - Toggling on/off calls onToggle with correct value
 * - Name input disabled-state: rendered only when enabled
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorktreeFields } from './DispatchForm.parts';

function renderWorktree(enabled = false, name = '') {
  const onToggle = vi.fn();
  const onNameChange = vi.fn();
  render(
    <WorktreeFields
      enabled={enabled}
      name={name}
      onToggle={onToggle}
      onNameChange={onNameChange}
    />,
  );
  return { onToggle, onNameChange };
}

describe('WorktreeFields', () => {
  it('renders the worktree toggle checkbox', () => {
    renderWorktree();
    expect(screen.getByTestId('dispatch-worktree-toggle')).toBeInTheDocument();
  });

  it('checkbox is unchecked when enabled=false', () => {
    renderWorktree(false);
    const cb = screen.getByTestId('dispatch-worktree-toggle') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('checkbox is checked when enabled=true', () => {
    renderWorktree(true, 'feat/x');
    const cb = screen.getByTestId('dispatch-worktree-toggle') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('name input is NOT rendered when toggle is off', () => {
    renderWorktree(false);
    expect(screen.queryByTestId('dispatch-worktree-name-input')).not.toBeInTheDocument();
  });

  it('name input IS rendered when toggle is on', () => {
    renderWorktree(true, '');
    expect(screen.getByTestId('dispatch-worktree-name-input')).toBeInTheDocument();
  });

  it('name input shows the current name value', () => {
    renderWorktree(true, 'feat/my-task');
    const input = screen.getByTestId('dispatch-worktree-name-input') as HTMLInputElement;
    expect(input.value).toBe('feat/my-task');
  });

  it('clicking checkbox calls onToggle(true) when currently off', () => {
    const { onToggle } = renderWorktree(false);
    fireEvent.click(screen.getByTestId('dispatch-worktree-toggle'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('clicking checkbox calls onToggle(false) when currently on', () => {
    const { onToggle } = renderWorktree(true, 'x');
    fireEvent.click(screen.getByTestId('dispatch-worktree-toggle'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('typing in name input calls onNameChange', () => {
    const { onNameChange } = renderWorktree(true, '');
    fireEvent.change(screen.getByTestId('dispatch-worktree-name-input'), {
      target: { value: 'feat/new' },
    });
    expect(onNameChange).toHaveBeenCalledWith('feat/new');
  });

  it('renders the label "Create git worktree"', () => {
    renderWorktree();
    expect(screen.getByText('Create git worktree')).toBeInTheDocument();
  });
});
