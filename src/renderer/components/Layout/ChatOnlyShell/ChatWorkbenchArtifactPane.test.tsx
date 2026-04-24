/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchArtifactPane } from './ChatWorkbenchArtifactPane';

let mockArtifactKind: 'empty' | 'file' | 'diff' = 'empty';
let mockOnClose = vi.fn();
const mockSelectArtifact = vi.fn();
const mockOpenFile = vi.fn();
const mockOpenReview = vi.fn();
let mockHistory = [
  {
    key: 'file:/tmp/example.ts',
    kind: 'file' as const,
    title: 'example.ts',
    subtitle: 'Editor',
    filePath: '/tmp/example.ts',
  },
];

vi.mock('./useWorkbenchArtifacts', () => ({
  useWorkbenchArtifacts: () => ({
    kind: mockArtifactKind,
    activeKey: mockArtifactKind === 'empty' ? null : `${mockArtifactKind}:key`,
    title:
      mockArtifactKind === 'empty'
        ? 'Artifacts'
        : mockArtifactKind === 'diff'
          ? 'Diff Review'
          : 'example.ts',
    subtitle:
      mockArtifactKind === 'empty' ? null : mockArtifactKind === 'diff' ? '2 files' : 'Editor',
    hasArtifact: mockArtifactKind !== 'empty',
    history: mockHistory,
    selectArtifact: mockSelectArtifact,
    selectedKey: null,
    selectedArtifact: null,
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
    openReview: mockOpenReview,
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
    openFile: mockOpenFile,
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
  mockHistory = [
    {
      key: 'file:/tmp/example.ts',
      kind: 'file',
      title: 'example.ts',
      subtitle: 'Editor',
      filePath: '/tmp/example.ts',
    },
  ];
  mockSelectArtifact.mockReset();
  mockOpenFile.mockReset();
  mockOpenReview.mockReset();
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
    expect(screen.getByTestId('artifact-history-list')).toBeDefined();
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

  it('selects a file artifact from history through the viewer manager', () => {
    mockArtifactKind = 'file';
    render(<ChatWorkbenchArtifactPane onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('artifact-history-item'));
    expect(mockSelectArtifact).toHaveBeenCalledWith('file:/tmp/example.ts');
    expect(mockOpenFile).toHaveBeenCalledWith('/tmp/example.ts');
  });

  it('reopens a diff artifact from history through the diff review manager', () => {
    mockArtifactKind = 'diff';
    mockHistory = [
      {
        key: 'diff:s1:abc',
        kind: 'diff',
        title: 'Diff Review',
        subtitle: '2 files',
        review: {
          sessionId: 's1',
          snapshotHash: 'abc',
          projectRoot: '/tmp/project',
          filePaths: ['src/example.ts'],
        },
      },
    ];
    render(<ChatWorkbenchArtifactPane onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('artifact-history-item'));
    expect(mockSelectArtifact).toHaveBeenCalledWith('diff:s1:abc');
    expect(mockOpenReview).toHaveBeenCalledWith('s1', 'abc', '/tmp/project', ['src/example.ts']);
  });
});
