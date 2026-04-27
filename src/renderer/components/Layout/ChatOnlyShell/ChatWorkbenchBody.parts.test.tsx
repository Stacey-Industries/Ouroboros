/**
 * @vitest-environment jsdom
 *
 * Smoke tests for ChatWorkbenchBody.parts exported components:
 *   - TwoTierRailSurface: renders OuterProjectRail + InnerSidebar
 *   - WorkbenchApprovalSurface: renders without crashing
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test', projectRoots: ['/test'], addProjectRoot: vi.fn() }),
}));
vi.mock('../../../hooks/useConfig', () => ({
  useConfig: () => ({ config: { recentProjects: [] } }),
}));
vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({
    pendingCount: 0,
    requests: [],
    approve: vi.fn(),
    reject: vi.fn(),
    alwaysAllow: vi.fn(),
  }),
}));
vi.mock('./useWorkbenchRailActions', () => ({
  useWorkbenchRailActions: () => ({
    actions: {
      onPin: vi.fn(),
      onUnpin: vi.fn(),
      onArchive: vi.fn(),
      onDelete: vi.fn(),
      onRename: vi.fn(),
    },
  }),
}));
vi.mock('../../FileTree/FileTree', () => ({
  FileTree: () => <div data-testid="mock-file-tree" />,
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  TwoTierRailSurface,
  type TwoTierRailSurfaceProps,
  WorkbenchApprovalSurface,
} from './ChatWorkbenchBody.parts';
import type { ChatWorkbenchLayoutApi } from './useChatWorkbenchLayout';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLayout(overrides: Partial<ChatWorkbenchLayoutApi> = {}): ChatWorkbenchLayoutApi {
  return {
    railOpen: true,
    artifactOpen: false,
    utilityOpen: false,
    activeUtilityTab: 'activity',
    activeProject: null,
    projectStates: {},
    toggleRail: vi.fn(),
    setRailOpen: vi.fn(),
    toggleArtifact: vi.fn(),
    setArtifactOpen: vi.fn(),
    toggleUtility: vi.fn(),
    setUtilityOpen: vi.fn(),
    setActiveUtilityTab: vi.fn(),
    setActiveProject: vi.fn(),
    setActiveInnerTab: vi.fn(),
    getProjectState: vi.fn(() => ({ activeInnerTab: 'chats' as const })),
    ...overrides,
  };
}

beforeEach(() => {
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
    sessionCrud: {
      list: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
      active: vi.fn().mockResolvedValue({ success: true, sessionId: null }),
      onChanged: vi.fn().mockReturnValue(() => {}),
    },
  } as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
});

// ── TwoTierRailSurface ────────────────────────────────────────────────────────

function makeRailProps(overrides: Partial<TwoTierRailSurfaceProps> = {}): TwoTierRailSurfaceProps {
  return {
    layout: makeLayout(),
    sessionsState: { sessions: [], activeSessionId: null, refresh: vi.fn() } as never,
    threads: [],
    approvalRequests: [],
    compare: {
      isComparing: false,
      compareTarget: null,
      canCompare: vi.fn(() => false),
      openCompare: vi.fn(),
      closeCompare: vi.fn(),
    } as never,
    handlers: {
      handleCreateSession: vi.fn().mockResolvedValue(undefined),
      handleLaunchAgent: vi.fn(),
      handleSelectSession: vi.fn(),
      handleSelectRecentChat: vi.fn(),
    },
    terminal: undefined,
    dock: {
      visible: false,
      height: 240,
      setVisible: vi.fn(),
      setHeight: vi.fn(),
      toggleVisible: vi.fn(),
    } as never,
    ...overrides,
  };
}

describe('TwoTierRailSurface', () => {
  it('renders OuterProjectRail and InnerSidebar', () => {
    render(<TwoTierRailSurface {...makeRailProps()} />);
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    expect(screen.getByTestId('inner-sidebar')).toBeDefined();
  });

  it('passes activeProject=null to InnerSidebar (shows "No project")', () => {
    render(<TwoTierRailSurface {...makeRailProps({ layout: makeLayout({ activeProject: null }) })} />);
    expect(screen.getByText('No project')).toBeDefined();
  });

  it('passes activeProject label to InnerSidebar header', () => {
    render(
      <TwoTierRailSurface
        {...makeRailProps({ layout: makeLayout({ activeProject: '/home/user/my-app' }) })}
      />,
    );
    expect(screen.getByText('my-app')).toBeDefined();
  });

  it('renders inner sidebar tabstrip', () => {
    render(<TwoTierRailSurface {...makeRailProps()} />);
    expect(screen.getByTestId('inner-sidebar-tabstrip')).toBeDefined();
  });
});

// ── WorkbenchApprovalSurface ──────────────────────────────────────────────────

describe('WorkbenchApprovalSurface', () => {
  it('renders without crashing with empty props', () => {
    render(
      <WorkbenchApprovalSurface
        activeApprovalSessionIds={[]}
        approvalRequests={[]}
        handlers={{
          handleCreateSession: vi.fn(),
          handleLaunchAgent: vi.fn(),
          handleSelectSession: vi.fn(),
          handleSelectRecentChat: vi.fn(),
        }}
        sessionsState={{ sessions: [], activeSessionId: null, refresh: vi.fn() }}
        threads={[]}
      />,
    );
    // No crash = pass
  });
});
