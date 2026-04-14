/**
 * @vitest-environment jsdom
 *
 * BackgroundJobRow.test.tsx — unit tests for the job row component.
 */

import type { BackgroundJob } from '@shared/types/backgroundJob';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackgroundJobRow } from './BackgroundJobRow';

afterEach(() => cleanup());

function makeJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: 'j1',
    projectRoot: '/proj',
    prompt: 'Run the tests',
    status: 'queued',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('BackgroundJobRow', () => {
  it('renders the job label (prompt slice) when no label provided', () => {
    render(<BackgroundJobRow job={makeJob()} onCancel={vi.fn()} />);
    expect(screen.getByText('Run the tests')).toBeDefined();
  });

  it('renders the explicit label when provided', () => {
    render(<BackgroundJobRow job={makeJob({ label: 'My Task' })} onCancel={vi.fn()} />);
    expect(screen.getByText('My Task')).toBeDefined();
  });

  it('shows Cancel button for queued jobs', () => {
    render(<BackgroundJobRow job={makeJob({ status: 'queued' })} onCancel={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('shows Cancel button for running jobs', () => {
    render(<BackgroundJobRow job={makeJob({ status: 'running' })} onCancel={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('hides Cancel button for done jobs', () => {
    render(<BackgroundJobRow job={makeJob({ status: 'done' })} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides Cancel button for error jobs', () => {
    render(<BackgroundJobRow job={makeJob({ status: 'error' })} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides Cancel button for cancelled jobs', () => {
    render(<BackgroundJobRow job={makeJob({ status: 'cancelled' })} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onCancel with job id when Cancel clicked', () => {
    const onCancel = vi.fn();
    render(<BackgroundJobRow job={makeJob({ status: 'queued' })} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onCancel).toHaveBeenCalledWith('j1');
  });

  it('renders resultSummary when present', () => {
    render(
      <BackgroundJobRow
        job={makeJob({ status: 'done', resultSummary: 'All 42 tests passed' })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('All 42 tests passed')).toBeDefined();
  });

  it('renders errorMessage for error jobs', () => {
    render(
      <BackgroundJobRow
        job={makeJob({ status: 'error', errorMessage: 'Exit code 1' })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Exit code 1')).toBeDefined();
  });

  it('shows the correct status pill label', () => {
    const statuses: Array<[BackgroundJob['status'], string]> = [
      ['queued', 'Queued'],
      ['running', 'Running'],
      ['done', 'Done'],
      ['error', 'Error'],
      ['cancelled', 'Cancelled'],
    ];

    for (const [status, label] of statuses) {
      const { unmount } = render(<BackgroundJobRow job={makeJob({ status })} onCancel={vi.fn()} />);
      expect(screen.getByText(label)).toBeDefined();
      unmount();
    }
  });
});
