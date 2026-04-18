/**
 * DispatchQueueList.test.tsx — tests for the dispatch job queue list.
 *
 * Covers (per spec):
 * - Renders jobs from the jobs array
 * - Cancel button present only on queued / running jobs
 * - Cancel button absent on completed / failed / canceled jobs
 * - Tapping a card fires onSelect with the job id
 * - Tapping cancel fires onCancel with the job id (not onSelect)
 * - Empty state renders when jobs array is empty
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DispatchJob } from '../../types/electron-dispatch';
import { DispatchQueueList } from './DispatchQueueList';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-1',
    status: 'queued',
    createdAt: new Date().toISOString(),
    request: {
      title: 'Test job',
      prompt: 'Do something',
      projectPath: '/home/user/proj',
    },
    ...overrides,
  };
}

function renderList(jobs: DispatchJob[], selectedJobId: string | null = null) {
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  render(
    <DispatchQueueList
      jobs={jobs}
      selectedJobId={selectedJobId}
      onSelect={onSelect}
      onCancel={onCancel}
    />,
  );
  return { onSelect, onCancel };
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('DispatchQueueList — empty state', () => {
  it('shows empty state message when jobs array is empty', () => {
    renderList([]);
    expect(screen.getByText(/no dispatch jobs yet/i)).toBeInTheDocument();
  });

  it('does not render any job cards when empty', () => {
    renderList([]);
    expect(screen.queryByTestId('job-card-job-1')).not.toBeInTheDocument();
  });
});

// ── Job rendering ─────────────────────────────────────────────────────────────

describe('DispatchQueueList — job rendering', () => {
  it('renders a card for each job', () => {
    const jobs = [
      makeJob({ id: 'job-1', request: { title: 'Task A', prompt: 'p', projectPath: '/a' } }),
      makeJob({ id: 'job-2', request: { title: 'Task B', prompt: 'p', projectPath: '/b' } }),
    ];
    renderList(jobs);
    expect(screen.getByTestId('job-card-job-1')).toBeInTheDocument();
    expect(screen.getByTestId('job-card-job-2')).toBeInTheDocument();
  });

  it('shows the job title in the card', () => {
    renderList([makeJob({ request: { title: 'My important task', prompt: 'p', projectPath: '/x' } })]);
    expect(screen.getByText('My important task')).toBeInTheDocument();
  });

  it('shows the status pill for each job', () => {
    renderList([makeJob({ id: 'job-1', status: 'running' })]);
    expect(screen.getByTestId('job-status-job-1')).toHaveTextContent('running');
  });
});

// ── Cancel button visibility ──────────────────────────────────────────────────

describe('DispatchQueueList — cancel button', () => {
  it.each(['queued', 'running'] as const)(
    'cancel button is present for status "%s"',
    (status) => {
      renderList([makeJob({ id: 'job-1', status })]);
      expect(screen.getByTestId('job-cancel-job-1')).toBeInTheDocument();
    },
  );

  it.each(['completed', 'failed', 'canceled'] as const)(
    'cancel button is absent for terminal status "%s"',
    (status) => {
      renderList([makeJob({ id: 'job-1', status })]);
      expect(screen.queryByTestId('job-cancel-job-1')).not.toBeInTheDocument();
    },
  );
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('DispatchQueueList — interactions', () => {
  it('clicking a card fires onSelect with the job id', () => {
    const { onSelect } = renderList([makeJob({ id: 'job-1' })]);
    fireEvent.click(screen.getByTestId('job-card-job-1'));
    expect(onSelect).toHaveBeenCalledWith('job-1');
  });

  it('clicking cancel fires onCancel with the job id', () => {
    const { onCancel, onSelect } = renderList([makeJob({ id: 'job-1', status: 'queued' })]);
    fireEvent.click(screen.getByTestId('job-cancel-job-1'));
    expect(onCancel).toHaveBeenCalledWith('job-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('pressing Enter on a card fires onSelect', () => {
    const { onSelect } = renderList([makeJob({ id: 'job-1' })]);
    fireEvent.keyDown(screen.getByTestId('job-card-job-1'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('job-1');
  });

  it('pressing Space on a card fires onSelect', () => {
    const { onSelect } = renderList([makeJob({ id: 'job-1' })]);
    fireEvent.keyDown(screen.getByTestId('job-card-job-1'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('job-1');
  });

  it('selected card has aria-pressed=true', () => {
    renderList([makeJob({ id: 'job-1' })], 'job-1');
    expect(screen.getByTestId('job-card-job-1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('non-selected card has aria-pressed=false', () => {
    renderList([makeJob({ id: 'job-1' })], null);
    expect(screen.getByTestId('job-card-job-1')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── Section grouping ──────────────────────────────────────────────────────────

describe('DispatchQueueList — section grouping', () => {
  it('shows "Active" section heading for queued/running jobs', () => {
    renderList([makeJob({ status: 'queued' })]);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "Completed" section heading for terminal jobs', () => {
    renderList([makeJob({ status: 'completed' })]);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows both sections when both types exist', () => {
    renderList([
      makeJob({ id: 'job-1', status: 'running' }),
      makeJob({ id: 'job-2', status: 'failed' }),
    ]);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});
