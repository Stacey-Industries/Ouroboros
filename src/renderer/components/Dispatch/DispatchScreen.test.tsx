/**
 * @vitest-environment jsdom
 * DispatchScreen.test.tsx — Wave 34 Phase E.
 *
 * Happy-path coverage:
 *   1. Renders the form tab by default
 *   2. Successful submit calls IPC and switches to queue view
 *   3. Tapping a job card in queue opens detail view
 *   4. Back button in detail returns to queue
 *   5. Cancel button in detail calls cancel IPC
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DispatchJob } from '../../types/electron-dispatch';
import { DispatchScreen } from './DispatchScreen';

// ── Mock hooks ────────────────────────────────────────────────────────────────

const mockCancel = vi.fn().mockResolvedValue({ success: true });
let mockJobsList: DispatchJob[] = [];
const mockJobs = (): DispatchJob[] => mockJobsList;

vi.mock('../../hooks/useDispatchJobs', () => ({
  useDispatchJobs: () => ({
    jobs: mockJobs(),
    refresh: vi.fn(),
    cancel: mockCancel,
  }),
}));


vi.mock('../../contexts/ProjectContext', () => ({
  useProject: () => ({
    projectRoots: ['/projects/alpha', '/projects/beta'],
    projectRoot: '/projects/alpha',
    projectName: 'alpha',
    projectActions: {},
  }),
}));

// ── Mock window.electronAPI ───────────────────────────────────────────────────

const mockDispatchTask = vi.fn();

afterEach(() => { cleanup(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockJobsList = [];
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      sessions: {
        dispatchTask: mockDispatchTask,
        listDispatchJobs: vi.fn().mockResolvedValue({ success: true, jobs: [] }),
        onDispatchStatus: vi.fn(() => () => {}),
        cancelDispatchJob: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DispatchScreen', () => {
  it('renders form tab by default', () => {
    render(<DispatchScreen />);
    expect(screen.getByTestId('dispatch-form')).toBeDefined();
    expect(screen.getByTestId('dispatch-tab-form')).toBeDefined();
    expect(screen.getByTestId('dispatch-tab-queue')).toBeDefined();
  });

  it('successful submit calls IPC and switches to queue view', async () => {
    mockDispatchTask.mockResolvedValue({ success: true, jobId: 'job-1' });
    render(<DispatchScreen />);

    fireEvent.change(screen.getByTestId('dispatch-title-input'), { target: { value: 'My Task' } });
    fireEvent.change(screen.getByTestId('dispatch-prompt-input'), { target: { value: 'Do something useful' } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('dispatch-form'));
    });

    await waitFor(() => {
      expect(mockDispatchTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Task', prompt: 'Do something useful' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('dispatch-queue-list')).toBeDefined();
    });
  });

  it('tapping a job card in queue opens detail view', async () => {
    const job: DispatchJob = {
      id: 'job-42',
      status: 'running',
      createdAt: new Date().toISOString(),
      request: { title: 'Alpha Task', prompt: 'Do alpha', projectPath: '/projects/alpha' },
    };
    mockJobsList = [job];
    render(<DispatchScreen />);

    fireEvent.click(screen.getByTestId('dispatch-tab-queue'));
    expect(screen.getByTestId('dispatch-queue-list')).toBeDefined();

    fireEvent.click(screen.getByTestId('job-card-job-42'));

    await waitFor(() => {
      expect(screen.getByTestId('detail-title')).toBeDefined();
    });
  });

  it('back button in detail view returns to queue', async () => {
    const job: DispatchJob = {
      id: 'job-99',
      status: 'completed',
      createdAt: new Date().toISOString(),
      request: { title: 'Beta Task', prompt: 'Do beta', projectPath: '/projects/beta' },
    };
    mockJobsList = [job];
    render(<DispatchScreen />);

    fireEvent.click(screen.getByTestId('dispatch-tab-queue'));
    fireEvent.click(screen.getByTestId('job-card-job-99'));
    await waitFor(() => screen.getByTestId('detail-back-btn'));

    fireEvent.click(screen.getByTestId('detail-back-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-queue-list')).toBeDefined();
    });
  });

  it('cancel button in detail view calls cancel IPC', async () => {
    const job: DispatchJob = {
      id: 'job-55',
      status: 'running',
      createdAt: new Date().toISOString(),
      request: { title: 'Gamma Task', prompt: 'Do gamma', projectPath: '/projects/alpha' },
    };
    mockJobsList = [job];
    render(<DispatchScreen />);

    fireEvent.click(screen.getByTestId('dispatch-tab-queue'));
    fireEvent.click(screen.getByTestId('job-card-job-55'));
    await waitFor(() => screen.getByTestId('detail-cancel-btn'));

    fireEvent.click(screen.getByTestId('detail-cancel-btn'));
    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith('job-55');
    });
  });
});
