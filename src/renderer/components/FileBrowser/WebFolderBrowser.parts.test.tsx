/**
 * @vitest-environment jsdom
 *
 * Smoke tests for WebFolderBrowser.parts — WebFolderBrowserShell and its
 * private sub-components (exercised via render output).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the hook so Shell tests control state without async IPC.
// Use importOriginal to keep pure helpers (buildBreadcrumbs, parentPath) real.
vi.mock('./WebFolderBrowserHook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./WebFolderBrowserHook')>();
  return {
    ...actual,
    useWebFolderBrowser: vi.fn(),
  };
});

vi.mock('./WebFolderBrowserSupport', () => ({
  REQUEST_FOLDER_SELECTION_EVENT: 'agent-ide:request-folder-selection',
  resolveFolderSelection: vi.fn(),
}));

import { WebFolderBrowserShell } from './WebFolderBrowser.parts';
import { useWebFolderBrowser } from './WebFolderBrowserHook';

const mockUseWebFolderBrowser = vi.mocked(useWebFolderBrowser);

function makeHookReturn(overrides: Partial<ReturnType<typeof useWebFolderBrowser>> = {}) {
  return {
    state: {
      isOpen: true,
      currentPath: '/home/user',
      entries: [],
      loading: false,
      error: null,
    },
    open: vi.fn(),
    cancel: vi.fn(),
    select: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WebFolderBrowserShell', () => {
  it('renders nothing when isOpen is false', () => {
    mockUseWebFolderBrowser.mockReturnValue(
      makeHookReturn({ state: { isOpen: false, currentPath: '/', entries: [], loading: false, error: null } }),
    );
    const { container } = render(<WebFolderBrowserShell />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal dialog when isOpen is true', () => {
    mockUseWebFolderBrowser.mockReturnValue(makeHookReturn());
    render(<WebFolderBrowserShell />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByLabelText('Select Folder')).toBeDefined();
  });

  it('shows Select Folder heading inside modal', () => {
    mockUseWebFolderBrowser.mockReturnValue(makeHookReturn());
    render(<WebFolderBrowserShell />);
    // heading text rendered by ModalHeader
    expect(screen.getAllByText('Select Folder').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "No subdirectories" when entries list is empty', () => {
    mockUseWebFolderBrowser.mockReturnValue(makeHookReturn({ state: { isOpen: true, currentPath: '/', entries: [], loading: false, error: null } }));
    render(<WebFolderBrowserShell />);
    expect(screen.getByText('No subdirectories')).toBeDefined();
  });

  it('shows Loading... when loading is true', () => {
    mockUseWebFolderBrowser.mockReturnValue(
      makeHookReturn({ state: { isOpen: true, currentPath: '/', entries: [], loading: true, error: null } }),
    );
    render(<WebFolderBrowserShell />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('shows error message when error is set', () => {
    mockUseWebFolderBrowser.mockReturnValue(
      makeHookReturn({ state: { isOpen: true, currentPath: '/', entries: [], loading: false, error: 'Access denied' } }),
    );
    render(<WebFolderBrowserShell />);
    expect(screen.getByText('Access denied')).toBeDefined();
  });

  it('calls cancel when Cancel button is clicked', () => {
    const cancel = vi.fn();
    mockUseWebFolderBrowser.mockReturnValue(makeHookReturn({ cancel }));
    render(<WebFolderBrowserShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('calls select when Select This Folder button is clicked', () => {
    const select = vi.fn();
    mockUseWebFolderBrowser.mockReturnValue(makeHookReturn({ select }));
    render(<WebFolderBrowserShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Select This Folder' }));
    expect(select).toHaveBeenCalledOnce();
  });

  it('Select This Folder button is disabled while loading', () => {
    mockUseWebFolderBrowser.mockReturnValue(
      makeHookReturn({ state: { isOpen: true, currentPath: '/', entries: [], loading: true, error: null } }),
    );
    render(<WebFolderBrowserShell />);
    const btn = screen.getByRole('button', { name: 'Select This Folder' });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('calls cancel when backdrop overlay is clicked', () => {
    const cancel = vi.fn();
    mockUseWebFolderBrowser.mockReturnValue(makeHookReturn({ cancel }));
    render(<WebFolderBrowserShell />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(cancel).toHaveBeenCalled();
  });

  it('Up button is disabled at root path', () => {
    mockUseWebFolderBrowser.mockReturnValue(
      makeHookReturn({ state: { isOpen: true, currentPath: '/', entries: [], loading: false, error: null } }),
    );
    render(<WebFolderBrowserShell />);
    const upBtn = screen.getByRole('button', { name: 'Up' });
    expect(upBtn).toHaveProperty('disabled', true);
  });

  it('renders directory entries as buttons', () => {
    mockUseWebFolderBrowser.mockReturnValue(
      makeHookReturn({
        state: {
          isOpen: true,
          currentPath: '/home',
          entries: [
            { name: 'projects', path: '/home/projects', isDirectory: true },
            { name: 'notes.txt', path: '/home/notes.txt', isDirectory: false },
          ],
          loading: false,
          error: null,
        },
      }),
    );
    render(<WebFolderBrowserShell />);
    // Only directory shown
    expect(screen.getByText('projects')).toBeDefined();
    expect(screen.queryByText('notes.txt')).toBeNull();
  });
});
