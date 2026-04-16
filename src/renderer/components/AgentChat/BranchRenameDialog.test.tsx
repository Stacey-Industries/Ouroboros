/**
 * BranchRenameDialog.test.tsx — Wave 23 Phase B
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BranchRenameDialog } from './BranchRenameDialog';

afterEach(cleanup);

// ── electronAPI mock ──────────────────────────────────────────────────────────

function setupElectronApi(
  handler: (threadId: string, name: string) => Promise<{ success: boolean; error?: string }>,
): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        renameBranch: vi.fn().mockImplementation(handler),
      },
    },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setupElectronApi(() => Promise.resolve({ success: true }));
});

describe('BranchRenameDialog', () => {
  it('renders dialog with current name pre-filled', () => {
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="My branch"
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: /branch name/i }) as HTMLInputElement;
    expect(input.value).toBe('My branch');
  });

  it('renders Save and Cancel buttons', () => {
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="My branch"
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="My branch"
        onClose={onClose}
        onRenamed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="My branch"
        onClose={onClose}
        onRenamed={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="My branch"
        onClose={onClose}
        onRenamed={vi.fn()}
      />,
    );
    // Click the fixed overlay (the outermost div rendered by the portal)
    const backdrop = document.querySelector('[aria-hidden="false"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls renameBranch and onRenamed on successful save', async () => {
    const onRenamed = vi.fn();
    const onClose = vi.fn();
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="Old name"
        onClose={onClose}
        onRenamed={onRenamed}
      />,
    );
    const input = screen.getByRole('textbox', { name: /branch name/i });
    fireEvent.change(input, { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('thread-1', 'New name'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows error message when API returns failure', async () => {
    setupElectronApi(() =>
      Promise.resolve({ success: false, error: 'Name already taken' }),
    );
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="Old name"
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => screen.getByText('Name already taken'));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('disables Save button when input is empty or whitespace', () => {
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="My branch"
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: /branch name/i });
    fireEvent.change(input, { target: { value: '   ' } });
    const saveBtn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('trims whitespace from the saved name', async () => {
    const renameBranch = vi.fn().mockResolvedValue({ success: true });
    Object.defineProperty(window, 'electronAPI', {
      value: { agentChat: { renameBranch } },
      configurable: true,
      writable: true,
    });
    render(
      <BranchRenameDialog
        threadId="thread-1"
        currentName="Old"
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: /branch name/i });
    fireEvent.change(input, { target: { value: '  Trimmed  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(renameBranch).toHaveBeenCalledWith('thread-1', 'Trimmed'));
  });
});
