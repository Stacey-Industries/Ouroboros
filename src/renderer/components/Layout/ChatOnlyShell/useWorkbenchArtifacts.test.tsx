/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetArtifactHistoryStackForTests } from './useArtifactHistoryStack';
import { useWorkbenchArtifacts } from './useWorkbenchArtifacts';

let mockActiveSessionId: string | null = 'session-1';
let mockActiveFile: null | { path: string; name: string } = null;
let mockOpenFiles: Array<{ path: string; name?: string }> = [];
let mockDiffState: null | {
  sessionId: string;
  snapshotHash: string;
  projectRoot: string;
  filePaths?: string[];
  files: Array<unknown>;
} = null;

vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({ activeSessionId: mockActiveSessionId }),
}));

vi.mock('../../FileViewer/FileViewerManager', () => ({
  useFileViewerManager: () => ({
    activeFile: mockActiveFile,
    openFiles: mockOpenFiles,
  }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: mockDiffState }),
}));

describe('useWorkbenchArtifacts', () => {
  afterEach(() => {
    resetArtifactHistoryStackForTests();
    mockActiveSessionId = 'session-1';
    mockActiveFile = null;
    mockOpenFiles = [];
    mockDiffState = null;
  });

  it('prefers an explicit selection over current diff and file state', () => {
    mockActiveFile = { path: '/tmp/example.ts', name: 'example.ts' };
    mockOpenFiles = [mockActiveFile];
    mockDiffState = {
      sessionId: 'session-1',
      snapshotHash: 'hash-1',
      projectRoot: '/tmp/project',
      files: [{}],
    };

    const { result } = renderHook(() => useWorkbenchArtifacts());
    act(() => {
      result.current.selectArtifact('file:/tmp/example.ts');
    });

    expect(result.current.kind).toBe('file');
    expect(result.current.activeKey).toBe('file:/tmp/example.ts');
    expect(result.current.history.map((entry) => entry.key)).toEqual([
      'diff:session-1:hash-1',
      'file:/tmp/example.ts',
    ]);
  });

  it('falls back from diff to current file to recent history', () => {
    mockActiveFile = { path: '/tmp/example.ts', name: 'example.ts' };
    mockOpenFiles = [mockActiveFile];
    const { result, rerender } = renderHook(() => useWorkbenchArtifacts());

    expect(result.current.kind).toBe('file');
    expect(result.current.activeKey).toBe('file:/tmp/example.ts');

    mockActiveFile = null;
    mockOpenFiles = [];
    rerender();
    expect(result.current.kind).toBe('file');
    expect(result.current.activeKey).toBe('file:/tmp/example.ts');

    mockDiffState = {
      sessionId: 'session-1',
      snapshotHash: 'hash-1',
      projectRoot: '/tmp/project',
      files: [{}, {}],
    };
    rerender();
    expect(result.current.kind).toBe('diff');
    expect(result.current.activeKey).toBe('diff:session-1:hash-1');
  });

  it('keeps history isolated by active session id', () => {
    mockActiveFile = { path: '/tmp/example.ts', name: 'example.ts' };
    mockOpenFiles = [mockActiveFile];
    renderHook(() => useWorkbenchArtifacts());

    mockActiveSessionId = 'session-2';
    mockActiveFile = null;
    mockOpenFiles = [];
    const { result } = renderHook(() => useWorkbenchArtifacts());

    expect(result.current.history).toEqual([]);
    expect(result.current.kind).toBe('empty');
  });
});
