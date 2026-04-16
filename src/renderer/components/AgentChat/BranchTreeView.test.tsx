/**
 * BranchTreeView.test.tsx — Wave 23 Phase B
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BranchNode } from '../../types/electron';
import { BranchTreeView } from './BranchTreeView';

afterEach(cleanup);

// ── electronAPI mock ──────────────────────────────────────────────────────────

function makeNode(
  id: string,
  overrides: Partial<BranchNode> = {},
): BranchNode {
  return {
    id,
    branchName: `Branch ${id}`,
    isSideChat: false,
    children: [],
    ...overrides,
  };
}

function setupElectronApi(
  handler: () => Promise<{ success: boolean; branches?: BranchNode[]; error?: string }>,
): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        listBranches: vi.fn().mockImplementation(handler),
      },
    },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setupElectronApi(() =>
    Promise.resolve({ success: true, branches: [] }),
  );
});

describe('BranchTreeView', () => {
  it('shows loading state initially', () => {
    // Never resolves during this test
    setupElectronApi(() => new Promise(() => undefined));
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading branches/i)).toBeTruthy();
  });

  it('renders root row after load', async () => {
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText('Main thread'));
    expect(screen.getByText('Main thread')).toBeTruthy();
  });

  it('renders "No branches yet" when tree is empty', async () => {
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/no branches yet/i));
  });

  it('renders branch nodes returned by listBranches', async () => {
    setupElectronApi(() =>
      Promise.resolve({
        success: true,
        branches: [makeNode('a', { branchName: 'Feature branch' })],
      }),
    );
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText('Feature branch'));
  });

  it('marks the active thread with aria-current', async () => {
    setupElectronApi(() =>
      Promise.resolve({
        success: true,
        branches: [makeNode('a', { branchName: 'Branch A' })],
      }),
    );
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="a"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText('Branch A'));
    const active = screen.getByText('Branch A').closest('button');
    expect(active?.getAttribute('aria-current')).toBe('true');
  });

  it('renders nested children with deeper indentation', async () => {
    const child = makeNode('child', { branchName: 'Child branch' });
    const parent = makeNode('parent', { branchName: 'Parent branch', children: [child] });
    setupElectronApi(() =>
      Promise.resolve({ success: true, branches: [parent] }),
    );
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText('Child branch'));
    const parentBtn = screen.getByText('Parent branch').closest('button');
    const childBtn = screen.getByText('Child branch').closest('button');
    const parentIndent = parseInt(parentBtn?.style.paddingLeft ?? '0', 10);
    const childIndent = parseInt(childBtn?.style.paddingLeft ?? '0', 10);
    expect(childIndent).toBeGreaterThan(parentIndent);
  });

  it('calls onSelect with threadId when a branch row is clicked', async () => {
    const onSelect = vi.fn();
    setupElectronApi(() =>
      Promise.resolve({
        success: true,
        branches: [makeNode('a', { branchName: 'Branch A' })],
      }),
    );
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={onSelect}
      />,
    );
    await waitFor(() => screen.getByText('Branch A'));
    fireEvent.click(screen.getByText('Branch A'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('calls onSelect with rootThreadId when root row is clicked', async () => {
    const onSelect = vi.fn();
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="other"
        onSelect={onSelect}
      />,
    );
    await waitFor(() => screen.getByText('Main thread'));
    fireEvent.click(screen.getByText('Main thread'));
    expect(onSelect).toHaveBeenCalledWith('root');
  });

  it('shows error message when API call fails', async () => {
    setupElectronApi(() =>
      Promise.resolve({ success: false, error: 'DB error' }),
    );
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText('DB error'));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('renders side chat nodes with distinct aria label', async () => {
    setupElectronApi(() =>
      Promise.resolve({
        success: true,
        branches: [makeNode('sc', { branchName: 'SC', isSideChat: true })],
      }),
    );
    render(
      <BranchTreeView
        rootThreadId="root"
        rootTitle="Main thread"
        activeThreadId="root"
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText('SC'));
    expect(screen.getByLabelText('Side chat')).toBeTruthy();
  });
});
