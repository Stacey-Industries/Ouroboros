/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchArtifactPane } from './ChatWorkbenchArtifactPane';

let mockArtifactKind: 'empty' | 'file' | 'diff' = 'empty';
let mockOnClose = vi.fn();

vi.mock('./useWorkbenchArtifacts', () => ({
  useWorkbenchArtifacts: () => ({
    kind: mockArtifactKind,
    activeKey: mockArtifactKind === 'empty' ? null : `${mockArtifactKind}:key`,
    title: mockArtifactKind === 'empty'
      ? 'Artifacts'
      : (mockArtifactKind === 'diff' ? 'Diff Review' : 'example.ts'),
    subtitle: mockArtifactKind === 'empty'
      ? null
      : (mockArtifactKind === 'diff' ? '2 files' : 'Editor'),
    hasArtifact: mockArtifactKind !== 'empty',
  }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({
    state: { sessionId: 's1', snapshotHash: 'abc', files: [] },
    canRollback: false,
    acceptHunk: vi.fn(),
    rejectHunk: vi.fn(),
    acceptAllFile: vi.fn(),
    rejectAllFile: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    rollback: vi.fn(),
    closeReview: vi.fn(),
    confirmStaleOp: vi.fn(),
    dismissStaleOp: vi.fn(),
  }),
}));

vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: () => <div data-testid="diff-review-panel" />,
}));

vi.mock('../../FileViewer/FileViewerManager', () => ({
  useFileViewerManager: () => ({
    openFiles: [{ path: '/tmp/example.ts', isPinned: false, isPreview: false }],
    activeIndex: 0,
    setActive: vi.fn(),
    closeFile: vi.fn(),
    pinTab: vi.fn(),
    unpinTab: vi.fn(),
    togglePin: vi.fn(),
    closeOthers: vi.fn(),
    closeToRight: vi.fn(),
    closeAll: vi.fn(),
  }),
}));

vi.mock('../../FileViewer/FileViewerTabs', () => ({
  FileViewerTabs: () => <div data-testid="file-viewer-tabs" />,
}));

vi.mock('../EditorContent', () => ({
  EditorContent: () => <div data-testid="editor-content" />,
}));

afterEach(() => {
  cleanup();
  mockArtifactKind = 'empty';
  mockOnClose = vi.fn();
});

describe('ChatWorkbenchArtifactPane', () => {
  it('renders an empty state when no artifact is active', () => {
    render(<ChatWorkbenchArtifactPane onClose={mockOnClose} />);
    expect(screen.getByTestId('chat-workbench-artifact-pane')).toBeDefined();
    expect(screen.getByText('Artifacts')).toBeDefined();
    expect(screen.getByText(/Open a file reference or diff from chat/i)).toBeDefined();
  });

  it('renders the file viewer content for file artifacts', () => {
    mockArtifactKind = 'file';
    render(<ChatWorkbenchArtifactPane onClose={mockOnClose} />);
    expect(screen.getByTestId('file-viewer-tabs')).toBeDefined();
    expect(screen.getByTestId('editor-content')).toBeDefined();
  });

  it('renders diff review content for diff artifacts', () => {
    mockArtifactKind = 'diff';
    render(<ChatWorkbenchArtifactPane onClose={mockOnClose} />);
    expect(screen.getByTestId('diff-review-panel')).toBeDefined();
  });

  it('calls onClose when the header close button is clicked', () => {
    render(<ChatWorkbenchArtifactPane onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('chat-workbench-artifact-close'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
