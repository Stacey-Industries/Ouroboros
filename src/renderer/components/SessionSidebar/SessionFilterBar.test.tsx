/**
 * SessionFilterBar.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionFilterBar } from './SessionFilterBar';
import { DEFAULT_FILTER_STATE } from './sessionFilters';

afterEach(cleanup);

describe('SessionFilterBar', () => {
  it('renders status buttons for all five options', () => {
    render(<SessionFilterBar filters={DEFAULT_FILTER_STATE} onChange={vi.fn()} />);
    // Two "All" buttons exist (status + worktree groups) — query within the status group.
    const statusGroup = screen.getByRole('group', { name: /filter by status/i });
    expect(statusGroup.querySelector('button[aria-pressed]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Active$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Archived$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Queued$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Errored$/i })).toBeTruthy();
  });

  it('renders the project text input', () => {
    render(<SessionFilterBar filters={DEFAULT_FILTER_STATE} onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /filter by project/i })).toBeTruthy();
  });

  it('renders worktree segmented control', () => {
    render(<SessionFilterBar filters={DEFAULT_FILTER_STATE} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Worktree$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^None$/i })).toBeTruthy();
  });

  it('calls onChange with new status when a status button is clicked', () => {
    const onChange = vi.fn();
    render(<SessionFilterBar filters={DEFAULT_FILTER_STATE} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Archived$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' }),
    );
  });

  it('calls onChange with updated project text on input change', () => {
    const onChange = vi.fn();
    render(<SessionFilterBar filters={DEFAULT_FILTER_STATE} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: /filter by project/i });
    fireEvent.change(input, { target: { value: 'my-proj' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'my-proj' }),
    );
  });

  it('calls onChange with new worktree value when worktree button clicked', () => {
    const onChange = vi.fn();
    render(<SessionFilterBar filters={DEFAULT_FILTER_STATE} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Worktree$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ worktree: 'worktree' }),
    );
  });

  it('marks the active status button with aria-pressed=true', () => {
    const filters = { ...DEFAULT_FILTER_STATE, status: 'active' as const };
    render(<SessionFilterBar filters={filters} onChange={vi.fn()} />);
    const activeBtn = screen.getByRole('button', { name: /^Active$/i });
    expect(activeBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('reflects the current project value in the input', () => {
    const filters = { ...DEFAULT_FILTER_STATE, project: 'hello' };
    render(<SessionFilterBar filters={filters} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /filter by project/i }) as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('preserves other filter fields when only status changes', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTER_STATE, project: 'keep-me', worktree: 'worktree' as const };
    render(<SessionFilterBar filters={filters} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Errored$/i }));
    expect(onChange).toHaveBeenCalledWith({
      status: 'errored',
      project: 'keep-me',
      worktree: 'worktree',
    });
  });
});
