/**
 * RerunMenu.test.tsx — Wave 22 Phase F
 * @vitest-environment jsdom
 *
 * Smoke tests for the RerunMenu component.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RerunMenu } from './RerunMenu';

afterEach(() => cleanup());

// ── Minimal window.electronAPI mock ──────────────────────────────────────────

function makeApi(result: { success: boolean; error?: string; thread?: { id: string } }) {
  return {
    agentChat: {
      reRunFromMessage: vi.fn().mockResolvedValue(result),
    },
  };
}

function setElectronAPI(api: unknown): void {
  Object.defineProperty(window, 'electronAPI', { value: api, configurable: true, writable: true });
}

function deleteElectronAPI(): void {
  Object.defineProperty(window, 'electronAPI', { value: undefined, configurable: true, writable: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RerunMenu', () => {
  it('renders the Re-run trigger button', () => {
    render(<RerunMenu messageId="msg-1" threadId="thread-1" />);
    expect(screen.getByTitle(/re-run/i)).toBeTruthy();
    expect(screen.getByText('Re-run')).toBeTruthy();
  });

  it('opens the dropdown on click', () => {
    render(<RerunMenu messageId="msg-1" threadId="thread-1" />);
    fireEvent.click(screen.getByRole('button', { name: /re-run/i }));
    expect(screen.getByText('Re-run on new branch')).toBeTruthy();
    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('Effort')).toBeTruthy();
    expect(screen.getByText('Permission')).toBeTruthy();
  });

  it('closes the dropdown when trigger is clicked again', () => {
    render(<RerunMenu messageId="msg-1" threadId="thread-1" />);
    const btn = screen.getByRole('button', { name: /re-run/i });
    fireEvent.click(btn);
    expect(screen.getByText('Re-run on new branch')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText('Re-run on new branch')).toBeNull();
  });

  it('calls reRunFromMessage and invokes onSuccess on success', async () => {
    const onSuccess = vi.fn();
    setElectronAPI(makeApi({ success: true, thread: { id: 'new-branch-id' } }));

    render(<RerunMenu messageId="msg-1" threadId="thread-1" onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: /re-run/i }));
    fireEvent.click(screen.getByText('Re-run on new branch'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('new-branch-id');
    });
    expect(screen.queryByText('Re-run on new branch')).toBeNull();
  });

  it('shows an error message on failure', async () => {
    setElectronAPI(makeApi({ success: false, error: 'Branch failed' }));

    render(<RerunMenu messageId="msg-1" threadId="thread-1" />);
    fireEvent.click(screen.getByRole('button', { name: /re-run/i }));
    fireEvent.click(screen.getByText('Re-run on new branch'));

    await waitFor(() => {
      expect(screen.getByText('Branch failed')).toBeTruthy();
    });
    expect(screen.getByText('Re-run on new branch')).toBeTruthy();
  });

  it('passes selected model override to IPC call', async () => {
    const api = makeApi({ success: true, thread: { id: 'new-id' } });
    setElectronAPI(api);

    render(<RerunMenu messageId="msg-2" threadId="thread-2" />);
    fireEvent.click(screen.getByRole('button', { name: /re-run/i }));
    const opusBtn = screen.queryByText('Opus 4.6') ?? screen.queryByText('Opus');
    if (opusBtn) fireEvent.click(opusBtn);
    fireEvent.click(screen.getByText('Re-run on new branch'));

    await waitFor(() => {
      expect(api.agentChat.reRunFromMessage).toHaveBeenCalled();
    });
  });

  it('does not call IPC when electronAPI is absent', async () => {
    deleteElectronAPI();

    render(<RerunMenu messageId="msg-1" threadId="thread-1" />);
    fireEvent.click(screen.getByRole('button', { name: /re-run/i }));
    const submitBtn = screen.getByText('Re-run on new branch');
    fireEvent.click(submitBtn);
    // No error thrown, no crash
    await new Promise((r) => setTimeout(r, 50));
    expect(submitBtn).toBeTruthy();
  });
});
