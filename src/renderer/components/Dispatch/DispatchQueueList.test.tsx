/**
 * @vitest-environment jsdom
 *
 * DispatchQueueList.test.tsx — tests for the dispatch job queue list.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DispatchJob } from '../../types/electron-dispatch';
import { DispatchQueueList } from './DispatchQueueList';

afterEach(() => { cleanup(); });

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

describe('DispatchQueueList — empty state', () => {
  it('shows empty state message when jobs array is empty', () => {
    renderList([]);
    expect(screen.getByText(/no dispatch jobs yet/i)).not.toBeNull();
  });

  it('does not render any job cards when empty', () => {
    renderList([]);
    expect(screen.queryByTestId('job-card-job-1')).toBeNull();
  });
});

describe('DispatchQueueList — job rendering', () => {
  it('renders a card for each job', () => {
    const jobs = [
      makeJob({ id: 'job-1', request: { title: 'Task A', prompt: 'p', projectPath: '/a' } }),
      makeJob({ id: 'job-2', request: { title: 'Task B', prompt: 'p', projectPath: '/b' } }),
    ];
    renderList(jobs);
    expect(screen.getByTestId('job-card-job-1')).not.toBeNull();
    expect(screen.getByTestId('job-card-job-2')).not.toBeNull();
  });

  it('shows the job title in the card', () => {
    renderList([makeJob({ request: { title: 'My important task', prompt: 'p', projectPath: '/x' } })]);
    expect(screen.getByText('My important task')).not.toBeNull();
  });

  it('shows the status pill for each job', () => {
    renderList([makeJob({ id: 'job-1', status: 'running' })]);
    expect(screen.getByTestId('job-status-job-1').textContent).toContain('running');
  });
});

describe('DispatchQueueList — cancel button', () => {
  it.each(['queued', 'running'] as const)(
    'cancel button is present for status "%s"',
    (status) => {
      renderList([makeJob({ id: 'job-1', status })]);
      expect(screen.getByTestId('job-cancel-job-1')).not.toBeNull();
    },
  );

  it.each(['completed', 'failed', 'canceled'] as const)(
    'cancel button is absent for terminal status "%s"',
    (status) => {
      renderList([makeJob({ id: 'job-1', status })]);
      expect(screen.queryByTestId('job-cancel-job-1')).toBeNull();
    },
  );
});

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
    expect(screen.getByTestId('job-card-job-1').getAttribute('aria-pressed')).toBe('true');
  });

  it('non-selected card has aria-pressed=false', () => {
    renderList([makeJob({ id: 'job-1' })], null);
    expect(screen.getByTestId('job-card-job-1').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('DispatchQueueList — section grouping', () => {
  it('shows "Active" section heading for queued/running jobs', () => {
    renderList([makeJob({ status: 'queued' })]);
    expect(screen.getByText('Active')).not.toBeNull();
  });

  it('shows "Completed" section heading for terminal jobs', () => {
    renderList([makeJob({ status: 'completed' })]);
    expect(screen.getByText('Completed')).not.toBeNull();
  });

  it('shows both sections when both types exist', () => {
    renderList([
      makeJob({ id: 'job-1', status: 'running' }),
      makeJob({ id: 'job-2', status: 'failed' }),
    ]);
    expect(screen.getByText('Active')).not.toBeNull();
    expect(screen.getByText('Completed')).not.toBeNull();
  });
});
