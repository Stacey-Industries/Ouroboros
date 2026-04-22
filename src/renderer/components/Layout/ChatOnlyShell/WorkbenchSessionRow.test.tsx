/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchSessionRow } from './WorkbenchSessionRow';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';

function makeItem(overrides: Partial<WorkbenchSessionItem> = {}): WorkbenchSessionItem {
  return {
    id: 'session-1',
    projectLabel: 'alpha',
    projectRoot: '/workspace/alpha',
    shortId: 'session-',
    lastUsedLabel: '5m ago',
    status: 'active',
    isActive: false,
    isPinned: false,
    isWorktree: false,
    terminalCount: 1,
    chatCount: 2,
    hasConversation: true,
    hasActiveThread: false,
    rawSession: {
      id: 'session-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-04-22T14:55:00.000Z',
      projectRoot: '/workspace/alpha',
      worktree: false,
      tags: [],
      activeTerminalIds: [],
      costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
      telemetry: { correlationIds: [], telemetrySessionId: 'session-1' },
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WorkbenchSessionRow', () => {
  it('renders project, short id, and metrics', () => {
    render(<WorkbenchSessionRow item={makeItem()} />);
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('session-')).toBeTruthy();
    expect(screen.getByText('1 terminal')).toBeTruthy();
    expect(screen.getByText('2 chats')).toBeTruthy();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<WorkbenchSessionRow item={makeItem()} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('workbench-session-row'));
    expect(onSelect).toHaveBeenCalledWith('session-1');
  });

  it('shows pinned and live chat indicators when present', () => {
    render(<WorkbenchSessionRow item={makeItem({ isPinned: true, hasActiveThread: true })} />);
    expect(screen.getByLabelText('Pinned session')).toBeTruthy();
    expect(screen.getByText('Live chat')).toBeTruthy();
  });

  it('marks the row as selected when active', () => {
    render(<WorkbenchSessionRow item={makeItem({ isActive: true })} />);
    expect(screen.getByRole('row').getAttribute('aria-selected')).toBe('true');
  });
});
