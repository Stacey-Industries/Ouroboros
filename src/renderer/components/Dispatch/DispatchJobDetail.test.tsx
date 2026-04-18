/**
 * DispatchJobDetail.test.tsx — tests for the job detail view.
 *
 * Covers (per spec):
 * - Shows static job fields: title, prompt preview, project path, status
 * - Shows worktree name when present; omits row when absent
 * - Cancel button present for non-terminal jobs (queued / running)
 * - Cancel button absent for terminal jobs (completed / failed / canceled)
 * - Log-tail stub notice renders
 * - onCancel fires with job id when cancel is clicked
 * - onClose fires when back button is clicked
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DispatchJob } from '../../types/electron-dispatch';
import { DispatchJobDetail } from './DispatchJobDetail';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-abc',
    status: 'running',
    createdAt: '2026-04-17T10:00:00.000Z',
    startedAt: '2026-04-17T10:00:05.000Z',
    request: {
      title: 'Refactor auth module',
      prompt: 'Please refactor the auth module to use the new token system.',
      projectPath: '/home/user/my-project',
    },
    ...overrides,
  };
}

function renderDetail(job: DispatchJob) {
  const onClose = vi.fn();
  const onCancel = vi.fn();
  render(<DispatchJobDetail job={job} onClose={onClose} onCancel={onCancel} />);
  return { onClose, onCancel };
}

// ── Static fields ─────────────────────────────────────────────────────────────

describe('DispatchJobDetail — static fields', () => {
  it('shows the job title', () => {
    renderDetail(makeJob());
    expect(screen.getByTestId('detail-title')).toHaveTextContent('Refactor auth module');
  });

  it('shows a prompt preview', () => {
    renderDetail(makeJob());
    expect(screen.getByTestId('detail-prompt')).toBeInTheDocument();
  });

  it('shows the project path', () => {
    renderDetail(makeJob());
    expect(screen.getByTestId('detail-project')).toHaveTextContent('/home/user/my-project');
  });

  it('shows the job status', () => {
    renderDetail(makeJob({ status: 'completed' }));
    expect(screen.getByTestId('detail-status')).toHaveTextContent('completed');
  });

  it('shows createdAt timestamp', () => {
    renderDetail(makeJob());
    expect(screen.getByTestId('detail-created')).toBeInTheDocument();
  });

  it('shows worktree name when present', () => {
    renderDetail(makeJob({ request: { title: 'T', prompt: 'p', projectPath: '/x', worktreeName: 'feat/branch' } }));
    expect(screen.getByTestId('detail-worktree')).toHaveTextContent('feat/branch');
  });

  it('omits worktree row when not present', () => {
    renderDetail(makeJob());
    expect(screen.queryByTestId('detail-worktree')).not.toBeInTheDocument();
  });
});

// ── Log tail stub ─────────────────────────────────────────────────────────────

describe('DispatchJobDetail — log tail stub', () => {
  it('renders the log streaming stub notice', () => {
    renderDetail(makeJob());
    expect(screen.getByTestId('detail-log-stub')).toBeInTheDocument();
  });
});

// ── Cancel button ─────────────────────────────────────────────────────────────

describe('DispatchJobDetail — cancel button', () => {
  it.each(['queued', 'running', 'starting'] as const)(
    'cancel button is visible for status "%s"',
    (status) => {
      renderDetail(makeJob({ status }));
      expect(screen.getByTestId('detail-cancel-btn')).toBeInTheDocument();
    },
  );

  it.each(['completed', 'failed', 'canceled'] as const)(
    'cancel button is absent for terminal status "%s"',
    (status) => {
      renderDetail(makeJob({ status }));
      expect(screen.queryByTestId('detail-cancel-btn')).not.toBeInTheDocument();
    },
  );

  it('clicking cancel fires onCancel with the job id', () => {
    const { onCancel } = renderDetail(makeJob({ id: 'job-abc', status: 'queued' }));
    fireEvent.click(screen.getByTestId('detail-cancel-btn'));
    expect(onCancel).toHaveBeenCalledWith('job-abc');
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe('DispatchJobDetail — navigation', () => {
  it('clicking the back button fires onClose', () => {
    const { onClose } = renderDetail(makeJob());
    fireEvent.click(screen.getByTestId('detail-back-btn'));
    expect(onClose).toHaveBeenCalled();
  });
});
