/**
 * BranchIndicator.test.tsx — Wave 23 Phase B
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BranchForkEntry } from './BranchIndicator';
import { BranchIndicator } from './BranchIndicator';

afterEach(cleanup);

const FORKS: BranchForkEntry[] = [
  { threadId: 'thread-a', branchName: 'Branch A' },
  { threadId: 'thread-b', branchName: 'Branch B' },
];

describe('BranchIndicator', () => {
  it('renders nothing when forks list is empty', () => {
    const { container } = render(
      <BranchIndicator forks={[]} currentThreadId="thread-x" onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all forks match currentThreadId', () => {
    const { container } = render(
      <BranchIndicator
        forks={[{ threadId: 'thread-a', branchName: 'Branch A' }]}
        currentThreadId="thread-a"
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows single-branch label with branch name when one fork', () => {
    render(
      <BranchIndicator
        forks={[{ threadId: 'thread-a', branchName: 'Branch A' }]}
        currentThreadId="other"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Branch A')).toBeTruthy();
  });

  it('calls onSelect with threadId when single branch is clicked', () => {
    const onSelect = vi.fn();
    render(
      <BranchIndicator
        forks={[{ threadId: 'thread-a', branchName: 'Branch A' }]}
        currentThreadId="other"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('Branch A'));
    expect(onSelect).toHaveBeenCalledWith('thread-a');
  });

  it('shows "N branches" label when multiple forks', () => {
    render(
      <BranchIndicator forks={FORKS} currentThreadId="other" onSelect={vi.fn()} />,
    );
    expect(screen.getByText('2 branches')).toBeTruthy();
  });

  it('opens dropdown on click when multiple forks', () => {
    render(
      <BranchIndicator forks={FORKS} currentThreadId="other" onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('2 branches'));
    expect(screen.getByText('Branch A')).toBeTruthy();
    expect(screen.getByText('Branch B')).toBeTruthy();
  });

  it('calls onSelect and closes dropdown when dropdown item is clicked', () => {
    const onSelect = vi.fn();
    render(
      <BranchIndicator forks={FORKS} currentThreadId="other" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('2 branches'));
    fireEvent.click(screen.getByText('Branch A'));
    expect(onSelect).toHaveBeenCalledWith('thread-a');
    // Dropdown should close: Branch A no longer visible as listbox option
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters out the currentThreadId from visible forks', () => {
    const forks: BranchForkEntry[] = [
      { threadId: 'current', branchName: 'This thread' },
      { threadId: 'other', branchName: 'Other' },
    ];
    render(
      <BranchIndicator forks={forks} currentThreadId="current" onSelect={vi.fn()} />,
    );
    // Only one fork visible, so shows single-branch label
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.queryByText('This thread')).toBeNull();
  });
});
