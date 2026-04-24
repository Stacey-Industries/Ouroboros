/**
 * NewSessionButton.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewSessionButton } from './NewSessionButton';

// ─── electronAPI mock ─────────────────────────────────────────────────────────

const mockSelectFolder = vi.fn();
const mockCreate = vi.fn();

beforeEach(() => {
  mockSelectFolder.mockResolvedValue({ success: true, path: '/projects/new-one' });
  mockCreate.mockResolvedValue({
    success: true,
    session: {
      id: 'session-1',
      createdAt: '2026-04-22T12:00:00.000Z',
      lastUsedAt: '2026-04-22T12:00:00.000Z',
      projectRoot: '/projects/new-one',
      worktree: false,
      tags: [],
      activeTerminalIds: [],
      costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
      telemetry: { correlationIds: [], telemetrySessionId: 'session-1' },
    },
  });

  Object.defineProperty(window, 'electronAPI', {
    value: {
      files: { selectFolder: mockSelectFolder },
      sessionCrud: { create: mockCreate },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NewSessionButton', () => {
  it('renders a button labelled "New session"', () => {
    render(<NewSessionButton />);
    expect(screen.getByRole('button', { name: /new session/i })).toBeTruthy();
  });

  it('calls files.selectFolder on click', async () => {
    render(<NewSessionButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockSelectFolder).toHaveBeenCalledOnce());
  });

  it('calls sessionCrud.create with the chosen path', async () => {
    render(<NewSessionButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/projects/new-one'));
  });

  it('calls onCreated callback after session is created', async () => {
    const onCreated = vi.fn();
    render(<NewSessionButton onCreated={onCreated} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });

  it('does not call onCreated when session creation does not return a session', async () => {
    mockCreate.mockResolvedValue({ success: false, error: 'create failed' });
    const onCreated = vi.fn();
    render(<NewSessionButton onCreated={onCreated} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does not call create if selectFolder is cancelled', async () => {
    mockSelectFolder.mockResolvedValue({ success: true, cancelled: true, path: null });
    render(<NewSessionButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockSelectFolder).toHaveBeenCalled());
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not call create if selectFolder returns no path', async () => {
    mockSelectFolder.mockResolvedValue({ success: false });
    render(<NewSessionButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockSelectFolder).toHaveBeenCalled());
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not call onCreated when folder pick is cancelled', async () => {
    mockSelectFolder.mockResolvedValue({ success: true, cancelled: true, path: null });
    const onCreated = vi.fn();
    render(<NewSessionButton onCreated={onCreated} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockSelectFolder).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('is not disabled initially', () => {
    render(<NewSessionButton />);
    const btn = screen.getByRole('button');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('works without electronAPI (no crash)', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    render(<NewSessionButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockCreate).not.toHaveBeenCalled());
  });
});
