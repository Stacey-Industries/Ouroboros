/**
 * AgentChatBranchTreeButton.test.tsx — Wave 23 Phase B
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../types/electron';
import { BranchTreeButton } from './AgentChatBranchTreeButton';

afterEach(cleanup);

// ── helpers ───────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    id: 'root',
    title: 'Main thread',
    version: 1,
    workspaceRoot: '/project',
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    messages: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

function setupElectronApi(): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        listBranches: vi.fn().mockResolvedValue({ success: true, branches: [] }),
      },
    },
    configurable: true,
    writable: true,
  });
}

beforeEach(setupElectronApi);

describe('BranchTreeButton', () => {
  it('renders nothing when rootThread is null', () => {
    const { container } = render(
      <BranchTreeButton rootThread={null} activeThreadId={null} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders "Branches" button when rootThread is provided', () => {
    render(
      <BranchTreeButton
        rootThread={makeThread()}
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTitle('Branch tree')).toBeTruthy();
    expect(screen.getByText('Branches')).toBeTruthy();
  });

  it('opens popover showing BranchTreeView on click', async () => {
    render(
      <BranchTreeButton
        rootThread={makeThread()}
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle('Branch tree'));
    // BranchTreeView renders a loading state then "No branches yet"
    await waitFor(() => screen.getByRole('tree'));
  });

  it('closes popover when Escape is pressed', async () => {
    render(
      <BranchTreeButton
        rootThread={makeThread()}
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle('Branch tree'));
    await waitFor(() => screen.getByRole('tree'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('calls onSelect and closes popover when a branch is selected', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        agentChat: {
          listBranches: vi.fn().mockResolvedValue({
            success: true,
            branches: [
              { id: 'branch-1', branchName: 'Feature', isSideChat: false, children: [] },
            ],
          }),
        },
      },
      configurable: true,
      writable: true,
    });
    const onSelect = vi.fn();
    render(
      <BranchTreeButton
        rootThread={makeThread()}
        activeThreadId="root"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTitle('Branch tree'));
    await waitFor(() => screen.getByText('Feature'));
    fireEvent.click(screen.getByText('Feature'));
    expect(onSelect).toHaveBeenCalledWith('branch-1');
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('sets aria-expanded on the button when open', async () => {
    render(
      <BranchTreeButton
        rootThread={makeThread()}
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    const btn = screen.getByTitle('Branch tree');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
