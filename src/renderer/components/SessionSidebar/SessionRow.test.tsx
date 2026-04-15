/**
 * SessionRow.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { cleanup(); });

import type { SessionRecord } from '../../types/electron';
import { SessionRow } from './SessionRow';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'abcdef12-0000-0000-0000-000000000000',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: new Date().toISOString(),
    projectRoot: '/projects/my-app',
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: 'abcdef12' },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionRow', () => {
  it('renders the project basename', () => {
    render(<SessionRow session={makeSession()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('my-app')).toBeTruthy();
  });

  it('renders the short session id (first 8 chars)', () => {
    render(<SessionRow session={makeSession()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('abcdef12')).toBeTruthy();
  });

  it('calls onClick with the session id when clicked', () => {
    const onClick = vi.fn();
    render(<SessionRow session={makeSession()} isActive={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('row'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith('abcdef12-0000-0000-0000-000000000000');
  });

  it('calls onClick on Enter keydown', () => {
    const onClick = vi.fn();
    render(<SessionRow session={makeSession()} isActive={false} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('calls onClick on Space keydown', () => {
    const onClick = vi.fn();
    render(<SessionRow session={makeSession()} isActive={false} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: ' ' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick on other keys', () => {
    const onClick = vi.fn();
    render(<SessionRow session={makeSession()} isActive={false} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Escape' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets aria-selected true when isActive', () => {
    render(<SessionRow session={makeSession()} isActive={true} onClick={vi.fn()} />);
    expect(screen.getByRole('row').getAttribute('aria-selected')).toBe('true');
  });

  it('sets aria-selected false when not active', () => {
    render(<SessionRow session={makeSession()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByRole('row').getAttribute('aria-selected')).toBe('false');
  });

  it('shows worktree badge when session.worktree is true', () => {
    render(<SessionRow session={makeSession({ worktree: true })} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('worktree')).toBeTruthy();
  });

  it('hides worktree badge when session.worktree is false', () => {
    render(<SessionRow session={makeSession({ worktree: false })} isActive={false} onClick={vi.fn()} />);
    expect(screen.queryByText('worktree')).toBeNull();
  });

  it('shows archived status pill when archivedAt is set', () => {
    const session = makeSession({ archivedAt: '2026-01-02T00:00:00.000Z' });
    render(<SessionRow session={session} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('archived')).toBeTruthy();
  });

  it('shows active status pill when not archived', () => {
    render(<SessionRow session={makeSession()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('is keyboard focusable (tabIndex 0)', () => {
    render(<SessionRow session={makeSession()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByRole('row').getAttribute('tabindex')).toBe('0');
  });

  it('handles Windows-style backslash path basenames', () => {
    render(
      <SessionRow
        session={makeSession({ projectRoot: 'C:\\Users\\dev\\my-win-project' })}
        isActive={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText('my-win-project')).toBeTruthy();
  });
});
