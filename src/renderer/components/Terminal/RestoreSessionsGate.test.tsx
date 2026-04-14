/**
 * @vitest-environment jsdom
 *
 * RestoreSessionsGate — smoke tests
 *
 * Verifies the gate mounts the dialog when sessions exist, hides it when none
 * exist, and handles dismiss without discarding.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

import type { PersistedSessionInfo } from '../../types/electron';
import { RestoreSessionsGate } from './RestoreSessionsGate';

function makeSession(overrides: Partial<PersistedSessionInfo> = {}): PersistedSessionInfo {
  return {
    id: 'session-1',
    cwd: '/home/user/project',
    shellPath: '/bin/zsh',
    cols: 80,
    rows: 24,
    createdAt: Date.now() - 1000,
    lastSeenAt: Date.now() - 1000,
    ...overrides,
  };
}

function setupElectronAPI(sessions: PersistedSessionInfo[]): {
  listPersistedSessions: ReturnType<typeof vi.fn>;
  restoreSession: ReturnType<typeof vi.fn>;
  discardPersistedSessions: ReturnType<typeof vi.fn>;
} {
  const listPersistedSessions = vi.fn().mockResolvedValue(sessions);
  const restoreSession = vi.fn().mockResolvedValue({ success: true });
  const discardPersistedSessions = vi.fn().mockResolvedValue({ success: true });

  Object.defineProperty(window, 'electronAPI', {
    value: { pty: { listPersistedSessions, restoreSession, discardPersistedSessions } },
    writable: true,
    configurable: true,
  });

  return { listPersistedSessions, restoreSession, discardPersistedSessions };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RestoreSessionsGate', () => {
  it('renders nothing while loading', () => {
    setupElectronAPI([makeSession()]);
    const { container } = render(<RestoreSessionsGate />);
    // Still in loading state synchronously
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog once sessions are loaded', async () => {
    setupElectronAPI([makeSession()]);
    render(<RestoreSessionsGate />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('renders nothing when no sessions exist', async () => {
    setupElectronAPI([]);
    const { container } = render(<RestoreSessionsGate />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.firstChild).toBeNull();
  });

  it('dismissing (×) hides dialog but does NOT call discardPersistedSessions', async () => {
    const { discardPersistedSessions } = setupElectronAPI([makeSession()]);
    const { container } = render(<RestoreSessionsGate />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText('Not now'));

    expect(discardPersistedSessions).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it('discard all calls discardPersistedSessions and hides the dialog', async () => {
    const { discardPersistedSessions } = setupElectronAPI([makeSession()]);
    const { container } = render(<RestoreSessionsGate />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Discard all'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(discardPersistedSessions).toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it('restore all calls restoreSession for each session and hides the dialog', async () => {
    const sessions = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    const { restoreSession } = setupElectronAPI(sessions);
    const { container } = render(<RestoreSessionsGate />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText(/Restore all/));

    await act(async () => {
      await Promise.resolve();
    });

    expect(restoreSession).toHaveBeenCalledTimes(2);
    expect(container.firstChild).toBeNull();
  });
});
