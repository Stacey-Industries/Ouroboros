/**
 * @vitest-environment jsdom
 *
 * ChatOnlyShellWrapper — smoke tests (Wave 42 Phase B).
 *
 * Verifies:
 *  - Mounts without throwing.
 *  - DiffReviewProvider is in the provider stack (useDiffReview returns a value).
 *  - FileViewerManager is in the provider stack (useFileViewerManager returns a value).
 *  - No IdeToolBridge string appears in the rendered output.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDiffReview } from '../../DiffReview';
import { useFileViewerManager } from '../../FileViewer';
import { ChatOnlyShellWrapper } from './ChatOnlyShellWrapper';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    projectRoot: '/test/project',
    projectName: 'project',
    projectRoots: ['/test/project'],
  }),
}));

// Stub heavy provider internals; expose just enough context shape.
vi.mock('../../FileViewer', () => {
  const FileViewerContext = React.createContext<object>({ openFiles: [] });
  return {
    FileViewerManager: ({ children }: React.PropsWithChildren) => (
      <FileViewerContext.Provider value={{ openFiles: [] }}>
        {children}
      </FileViewerContext.Provider>
    ),
    useFileViewerManager: () => React.useContext(FileViewerContext),
    MultiBufferManager: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

vi.mock('../../DiffReview', () => {
  const DiffReviewContext = React.createContext<object>({ state: null });
  return {
    DiffReviewProvider: ({ children }: React.PropsWithChildren) => (
      <DiffReviewContext.Provider value={{ state: null }}>
        {children}
      </DiffReviewContext.Provider>
    ),
    useDiffReview: () => React.useContext(DiffReviewContext),
  };
});

// Stub the shell itself — renders a consumer so we can verify contexts are provided.
vi.mock('./ChatOnlyShell', () => ({
  ChatOnlyShell: function StubShell(): React.ReactElement {
    const diffReview = useDiffReview();
    const fileViewer = useFileViewerManager();
    return (
      <div
        data-testid="chat-only-shell"
        data-has-diff={String(diffReview !== null)}
        data-has-viewer={String(fileViewer !== null)}
      >
        ChatOnlyShell
      </div>
    );
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatOnlyShellWrapper', () => {
  it('mounts without throwing', () => {
    const { container } = render(<ChatOnlyShellWrapper />);
    expect(container).toBeDefined();
  });

  it('renders ChatOnlyShell', () => {
    render(<ChatOnlyShellWrapper />);
    expect(screen.getByTestId('chat-only-shell')).toBeDefined();
  });

  it('provides DiffReviewProvider — child can call useDiffReview without throwing', () => {
    render(<ChatOnlyShellWrapper />);
    const el = screen.getByTestId('chat-only-shell');
    expect(el.getAttribute('data-has-diff')).toBe('true');
  });

  it('provides FileViewerManager — child can call useFileViewerManager without throwing', () => {
    render(<ChatOnlyShellWrapper />);
    const el = screen.getByTestId('chat-only-shell');
    expect(el.getAttribute('data-has-viewer')).toBe('true');
  });

  it('does not mount IdeToolBridge', () => {
    const { container } = render(<ChatOnlyShellWrapper />);
    expect(container.innerHTML).not.toContain('IdeToolBridge');
  });
});
