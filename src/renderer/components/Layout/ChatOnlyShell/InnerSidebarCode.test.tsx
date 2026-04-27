/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_FILE_EVENT } from '../../../hooks/appEventNames';
import { InnerSidebarCode } from './InnerSidebarCode';

vi.mock('../../FileTree/FileTree', () => ({
  FileTree: ({
    projectRoots,
    onFileSelect,
  }: {
    projectRoots: string[];
    onFileSelect: (path: string) => void;
  }) => (
    <div data-testid="mock-file-tree" data-roots={projectRoots.join('|')}>
      <button type="button" onClick={() => onFileSelect('/proj/foo.ts')}>
        select foo
      </button>
    </div>
  ),
}));

afterEach(cleanup);

describe('InnerSidebarCode', () => {
  it('renders the code container', () => {
    render(<InnerSidebarCode activeProject={null} />);
    expect(screen.getByTestId('inner-sidebar-code')).toBeDefined();
  });

  it('shows empty state when no active project', () => {
    render(<InnerSidebarCode activeProject={null} />);
    expect(screen.getByText(/no project selected/i)).toBeDefined();
    expect(screen.queryByTestId('mock-file-tree')).toBeNull();
  });

  it('mounts FileTree with active project root when set', () => {
    render(<InnerSidebarCode activeProject="/proj" />);
    expect(screen.getByTestId('mock-file-tree')).toBeDefined();
    expect(screen.getByTestId('mock-file-tree').getAttribute('data-roots')).toBe('/proj');
  });

  it('dispatches OPEN_FILE_EVENT when file selected and no override', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_FILE_EVENT, listener);
    render(<InnerSidebarCode activeProject="/proj" />);
    screen.getByText('select foo').click();
    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.filePath).toBe('/proj/foo.ts');
    window.removeEventListener(OPEN_FILE_EVENT, listener);
  });

  it('calls onFileOpen override instead of dispatching when provided', () => {
    const onFileOpen = vi.fn();
    const listener = vi.fn();
    window.addEventListener(OPEN_FILE_EVENT, listener);
    render(<InnerSidebarCode activeProject="/proj" onFileOpen={onFileOpen} />);
    screen.getByText('select foo').click();
    expect(onFileOpen).toHaveBeenCalledWith('/proj/foo.ts');
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(OPEN_FILE_EVENT, listener);
  });
});
