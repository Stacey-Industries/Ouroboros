/**
 * @vitest-environment jsdom
 *
 * InnerAppLayout — smoke test.
 * Verifies the component tree assembles without crashing.
 * Heavy sub-components are stubbed out.
 */

import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InnerAppLayoutProps } from './InnerAppLayout';
import { InnerAppLayout } from './InnerAppLayout';

// Stub every module that would require Electron, xterm, Monaco, etc.
vi.mock('../FileViewer', () => ({ FileViewerManager: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../FileViewer/MultiBufferManager', () => ({ MultiBufferManager: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../DiffReview', () => ({ DiffReviewProvider: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../shared/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('./IdeToolBridge', () => ({ IdeToolBridge: () => null }));
vi.mock('./AppLayoutConnected', () => ({ AppLayoutConnected: () => <div data-testid="app-layout" /> }));
vi.mock('./CentrePaneConnected', () => ({ CentrePaneConnected: () => null }));
vi.mock('../FileTree/ProjectPicker', () => ({ ProjectPicker: () => null }));
vi.mock('../Terminal/TerminalManager', () => ({ TerminalManager: () => null }));
vi.mock('./InnerAppLayout.agent', () => ({ AgentSidebarContent: () => null }));
vi.mock('./InnerAppLayout.overlays', () => ({ LayoutOverlays: () => null }));
vi.mock('./SidebarSections', () => ({ SidebarSections: () => null }));

const baseProps: InnerAppLayoutProps = {
  projectRoot: '/home/user/project',
  projectRoots: ['/home/user/project'],
  addProjectRoot: vi.fn(),
  recentProjects: [],
  setRecentProjects: vi.fn(),
  handleProjectChange: vi.fn(),
  keybindings: {},
  workspaceLayouts: [],
  activeLayoutName: 'default',
  handleSelectLayout: vi.fn(),
  handleSaveLayout: vi.fn(),
  handleUpdateLayout: vi.fn(),
  handleDeleteLayout: vi.fn(),
  terminalControl: {
    sessions: [],
    activeSessionId: null,
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    onNewClaude: vi.fn(),
    onNewCodex: vi.fn(),
    onReorder: vi.fn(),
    focusOrCreate: vi.fn(),
    onSpawnClaude: vi.fn(),
    onSpawnCodex: vi.fn(),
  },
  sessions: [],
  activeSessionId: null,
  recordingSessions: new Set(),
  handleTerminalRestart: vi.fn(),
  handleTerminalClose: vi.fn(),
  handleTerminalTitleChange: vi.fn(),
  spawnSession: vi.fn(),
  handleToggleRecording: vi.fn(),
  handleSplit: vi.fn(),
  handleCloseSplit: vi.fn(),
  paletteOpen: false,
  closePalette: vi.fn(),
  commands: [],
  recentIds: [],
  handleExecute: vi.fn(),
  filePickerOpen: false,
  setFilePickerOpen: vi.fn(),
  symbolSearchOpen: false,
  setSymbolSearchOpen: vi.fn(),
  perfOverlayVisible: false,
  persistTerminalSessions: false,
};

afterEach(() => cleanup());

describe('InnerAppLayout', () => {
  it('renders without crashing', () => {
    const { container } = render(<InnerAppLayout {...baseProps} />);
    expect(container).toBeDefined();
  });

  it('renders with persistTerminalSessions enabled', () => {
    const { container } = render(
      <InnerAppLayout {...baseProps} persistTerminalSessions={true} />,
    );
    expect(container).toBeDefined();
  });
});
