/**
 * @vitest-environment jsdom
 *
 * BackgroundJobsPanel.test.tsx — unit tests for the panel component.
 */

import type { BackgroundJob, BackgroundJobUpdate } from '@shared/types/backgroundJob';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundJobsPanel } from './BackgroundJobsPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: 'j1',
    projectRoot: '/proj',
    prompt: 'Do work',
    status: 'queued',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let onUpdateCallback: ((update: BackgroundJobUpdate) => void) | null = null;

function buildApi(jobs: BackgroundJob[] = []) {
  return {
    backgroundJobs: {
      list: vi.fn().mockResolvedValue({
        success: true,
        snapshot: { jobs, runningCount: 0, queuedCount: jobs.length, maxConcurrent: 2 },
      }),
      onUpdate: vi.fn((cb: (u: BackgroundJobUpdate) => void) => {
        onUpdateCallback = cb;
        return () => { onUpdateCallback = null; };
      }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
      clearCompleted: vi.fn().mockResolvedValue({ success: true }),
      enqueue: vi.fn(),
    },
  };
}

function openPanel(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-background-jobs'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BackgroundJobsPanel', () => {
  beforeEach(() => {
    onUpdateCallback = null;
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('renders nothing when closed', () => {
    Object.defineProperty(window, 'electronAPI', { value: buildApi(), writable: true, configurable: true });
    const { container } = render(<BackgroundJobsPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('opens on agent-ide:open-background-jobs DOM event', async () => {
    Object.defineProperty(window, 'electronAPI', { value: buildApi(), writable: true, configurable: true });
    const { getByRole } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    expect(getByRole('dialog')).toBeDefined();
  });

  it('toggles closed on second open event', async () => {
    Object.defineProperty(window, 'electronAPI', { value: buildApi(), writable: true, configurable: true });
    const { getByRole, queryByRole } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    expect(getByRole('dialog')).toBeDefined();
    await act(async () => { openPanel(); });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('shows empty state when no jobs', async () => {
    Object.defineProperty(window, 'electronAPI', { value: buildApi([]), writable: true, configurable: true });
    const { getByText } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    await act(async () => {});
    expect(getByText(/no background jobs yet/i)).toBeDefined();
  });

  it('renders loaded jobs', async () => {
    const jobs = [makeJob({ label: 'My Task', status: 'running' })];
    Object.defineProperty(window, 'electronAPI', { value: buildApi(jobs), writable: true, configurable: true });
    const { getByText } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    await act(async () => {});
    expect(getByText('My Task')).toBeDefined();
  });

  it('applies incoming update to existing job', async () => {
    const jobs = [makeJob({ id: 'j1', status: 'running', label: 'Task A' })];
    Object.defineProperty(window, 'electronAPI', { value: buildApi(jobs), writable: true, configurable: true });
    const { getByText } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    await act(async () => {});

    await act(async () => {
      onUpdateCallback?.({ jobId: 'j1', changes: { status: 'done', resultSummary: 'Finished OK' } });
    });

    expect(getByText('Done')).toBeDefined();
    expect(getByText('Finished OK')).toBeDefined();
  });

  it('calls cancel API when Cancel button clicked', async () => {
    const api = buildApi([makeJob({ id: 'j1', status: 'queued', label: 'Cancel Me' })]);
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });
    const { getAllByRole } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    await act(async () => {});
    const buttons = getAllByRole('button');
    const cancelBtn = buttons.find((b) => b.getAttribute('aria-label')?.startsWith('Cancel job'));
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn!);
    await act(async () => {});
    expect(api.backgroundJobs.cancel).toHaveBeenCalledWith('j1');
  });

  it('calls clearCompleted and removes terminal jobs from list', async () => {
    const jobs = [
      makeJob({ id: 'j1', status: 'done', label: 'Done Task' }),
      makeJob({ id: 'j2', status: 'running', label: 'Running Task' }),
    ];
    const api = buildApi(jobs);
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });
    const { queryByText, getByText, getAllByRole } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    await act(async () => {});
    const buttons = getAllByRole('button');
    const clearBtn = buttons.find((b) => b.textContent?.includes('Clear completed'));
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn!);
    await act(async () => {});
    expect(api.backgroundJobs.clearCompleted).toHaveBeenCalled();
    expect(queryByText('Done Task')).toBeNull();
    expect(getByText('Running Task')).toBeDefined();
  });

  it('closes when close button is clicked', async () => {
    Object.defineProperty(window, 'electronAPI', { value: buildApi(), writable: true, configurable: true });
    const { queryByRole, getAllByRole } = render(<BackgroundJobsPanel />);
    await act(async () => { openPanel(); });
    const closeBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Close background jobs panel',
    );
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);
    expect(queryByRole('dialog')).toBeNull();
  });
});
