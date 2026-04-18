/**
 * DispatchForm.test.tsx — tests for the dispatch submission form.
 *
 * Covers (per spec):
 * - Form renders title input, prompt textarea, project select
 * - Validation: empty title is rejected (no IPC call)
 * - Validation: empty prompt is rejected (no IPC call)
 * - Worktree toggle disables name input when off (name field absent)
 * - Success path: calls IPC with correct DispatchRequest shape; clears form
 * - Error path: shows inline error message on IPC failure
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispatchForm } from './DispatchForm';

// ── electronAPI mock ──────────────────────────────────────────────────────────

const mockDispatchTask = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: {
      sessions: {
        dispatchTask: mockDispatchTask,
      },
    },
    writable: true,
    configurable: true,
  });
});

const PROJECT_ROOTS = ['/home/user/proj-a', '/home/user/proj-b'];

function renderForm(roots = PROJECT_ROOTS) {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(<DispatchForm projectRoots={roots} onSuccess={onSuccess} onError={onError} />);
  return { onSuccess, onError };
}

function fillTitle(value: string) {
  fireEvent.change(screen.getByTestId('dispatch-title-input'), { target: { value } });
}

function fillPrompt(value: string) {
  fireEvent.change(screen.getByTestId('dispatch-prompt-input'), { target: { value } });
}

function submit() {
  fireEvent.submit(screen.getByTestId('dispatch-form'));
}

// ── Render ────────────────────────────────────────────────────────────────────

describe('DispatchForm — render', () => {
  it('renders title input', () => {
    renderForm();
    expect(screen.getByTestId('dispatch-title-input')).toBeInTheDocument();
  });

  it('renders prompt textarea', () => {
    renderForm();
    expect(screen.getByTestId('dispatch-prompt-input')).toBeInTheDocument();
  });

  it('renders project select with configured roots', () => {
    renderForm();
    const select = screen.getByTestId('dispatch-project-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.options).toHaveLength(PROJECT_ROOTS.length);
  });

  it('renders worktree toggle', () => {
    renderForm();
    expect(screen.getByTestId('dispatch-worktree-toggle')).toBeInTheDocument();
  });

  it('worktree name input is hidden initially', () => {
    renderForm();
    expect(screen.queryByTestId('dispatch-worktree-name-input')).not.toBeInTheDocument();
  });

  it('worktree name input appears after enabling toggle', () => {
    renderForm();
    fireEvent.click(screen.getByTestId('dispatch-worktree-toggle'));
    expect(screen.getByTestId('dispatch-worktree-name-input')).toBeInTheDocument();
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('DispatchForm — validation', () => {
  it('rejects empty title: shows error, does not call IPC', async () => {
    renderForm();
    fillPrompt('do the thing');
    submit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockDispatchTask).not.toHaveBeenCalled();
  });

  it('rejects empty prompt: shows error, does not call IPC', async () => {
    renderForm();
    fillTitle('My task');
    submit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockDispatchTask).not.toHaveBeenCalled();
  });

  it('rejects worktree enabled with empty name', async () => {
    renderForm();
    fillTitle('My task');
    fillPrompt('do the thing');
    fireEvent.click(screen.getByTestId('dispatch-worktree-toggle'));
    submit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockDispatchTask).not.toHaveBeenCalled();
  });
});

// ── Success path ──────────────────────────────────────────────────────────────

describe('DispatchForm — success path', () => {
  it('calls dispatchTask with correct shape and fires onSuccess', async () => {
    mockDispatchTask.mockResolvedValue({ success: true, jobId: 'job-123' });
    const { onSuccess } = renderForm();
    fillTitle('Test task');
    fillPrompt('Run the tests');
    submit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('job-123'));
    expect(mockDispatchTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test task',
        prompt: 'Run the tests',
        projectPath: PROJECT_ROOTS[0],
      }),
    );
  });

  it('includes worktreeName in request when toggle is on', async () => {
    mockDispatchTask.mockResolvedValue({ success: true, jobId: 'job-456' });
    renderForm();
    fillTitle('Worktree task');
    fillPrompt('Do work in branch');
    fireEvent.click(screen.getByTestId('dispatch-worktree-toggle'));
    fireEvent.change(screen.getByTestId('dispatch-worktree-name-input'), {
      target: { value: 'feat/my-branch' },
    });
    submit();
    await waitFor(() =>
      expect(mockDispatchTask).toHaveBeenCalledWith(
        expect.objectContaining({ worktreeName: 'feat/my-branch' }),
      ),
    );
  });

  it('clears the form after successful submit', async () => {
    mockDispatchTask.mockResolvedValue({ success: true, jobId: 'job-789' });
    renderForm();
    fillTitle('Clear me');
    fillPrompt('After submit');
    submit();
    await waitFor(() => {
      const titleInput = screen.getByTestId('dispatch-title-input') as HTMLInputElement;
      expect(titleInput.value).toBe('');
    });
  });
});

// ── Error path ────────────────────────────────────────────────────────────────

describe('DispatchForm — error path', () => {
  it('shows inline error message on IPC failure', async () => {
    mockDispatchTask.mockResolvedValue({ success: false, error: 'Project not allowed' });
    const { onError } = renderForm();
    fillTitle('Failing task');
    fillPrompt('Will fail');
    submit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Project not allowed');
    });
    expect(onError).toHaveBeenCalledWith('Project not allowed');
  });

  it('shows inline error when API is unavailable', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: { sessions: {} },
      writable: true,
      configurable: true,
    });
    const { onError } = renderForm();
    fillTitle('No API');
    fillPrompt('No sessions API');
    submit();
    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });
});
