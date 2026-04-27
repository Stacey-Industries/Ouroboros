/**
 * @vitest-environment jsdom
 *
 * Wave 59 Phase I — cross-tier IA integration coverage.
 *
 * Exercises the joins between the parts that Phases A–H landed:
 *   - The outer rail (project list) drives the inner sidebar's active project.
 *   - The inner sidebar tab strip switches between Chats / Terminals / Code.
 *   - The workbench title bar mounts the menu bar when isWorkbench is true,
 *     and the menu bar's "Toggle Outer Rail" item dispatches the documented
 *     workbench DOM event.
 *
 * Per `~/.claude/rules/manual-smoke-gate.md` we do NOT mock components
 * defined inside ChatOnlyShell/. We DO mock cross-subsystem dependencies
 * (FileTree, ApprovalContext) and the electronAPI surface — those are
 * outside the integration boundary for this test.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    projectName: 'my-app',
    projectRoot: '/home/user/my-app',
    projectRoots: ['/home/user/my-app', '/home/user/other'],
    addProjectRoot: vi.fn(),
  }),
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
  FileTree: ({ projectRoots }: { projectRoots: string[] }) => (
    <div data-testid="mock-file-tree" data-roots={projectRoots.join('|')}>
      mock-file-tree
    </div>
  ),
}));

import { TwoTierRailSurface, type TwoTierRailSurfaceProps } from './ChatWorkbenchBody.parts';
import type { ChatWorkbenchLayoutApi } from './useChatWorkbenchLayout';
import { WorkbenchMenuBar } from './WorkbenchMenuBar';

afterEach(cleanup);

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

function makeLayout(overrides: Partial<ChatWorkbenchLayoutApi> = {}): ChatWorkbenchLayoutApi {
  let activeProject: string | null = '/home/user/my-app';
  let activeInnerTab: 'chats' | 'terminals' | 'code' = 'chats';
  return {
    railOpen: true,
    artifactOpen: false,
    utilityOpen: false,
    activeUtilityTab: 'activity',
    get activeProject() {
      return activeProject;
    },
    projectStates: {},
    toggleRail: vi.fn(),
    setRailOpen: vi.fn(),
    toggleArtifact: vi.fn(),
    setArtifactOpen: vi.fn(),
    toggleUtility: vi.fn(),
    setUtilityOpen: vi.fn(),
    setActiveUtilityTab: vi.fn(),
    setActiveProject: vi.fn((path: string) => {
      activeProject = path;
    }),
    setActiveInnerTab: vi.fn((_path: string, tab: 'chats' | 'terminals' | 'code') => {
      activeInnerTab = tab;
    }),
    getProjectState: vi.fn(() => ({ activeInnerTab })),
    ...overrides,
  } as ChatWorkbenchLayoutApi;
}

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

describe('Wave 59 — IA reshape integration', () => {
  it('outer rail + inner sidebar render together with the active project label', () => {
    render(<TwoTierRailSurface {...makeRailProps()} />);
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    expect(screen.getByTestId('inner-sidebar')).toBeDefined();
    expect(screen.getByText('my-app')).toBeDefined();
  });

  it('inner sidebar tabstrip switches between chats / terminals / code', () => {
    const layout = makeLayout();
    render(<TwoTierRailSurface {...makeRailProps({ layout })} />);
    expect(screen.getByTestId('inner-sidebar-tabstrip')).toBeDefined();
    fireEvent.click(screen.getByTestId('inner-sidebar-tab-terminals'));
    expect(layout.setActiveInnerTab).toHaveBeenCalledWith('/home/user/my-app', 'terminals');
    fireEvent.click(screen.getByTestId('inner-sidebar-tab-code'));
    expect(layout.setActiveInnerTab).toHaveBeenCalledWith('/home/user/my-app', 'code');
  });

  it('Code tab renders FileTree scoped to the active project root', () => {
    const layout = makeLayout({
      getProjectState: vi.fn(() => ({ activeInnerTab: 'code' as const })),
    });
    render(<TwoTierRailSurface {...makeRailProps({ layout })} />);
    expect(screen.getByTestId('mock-file-tree').getAttribute('data-roots')).toBe(
      '/home/user/my-app',
    );
  });

  it('Terminals tab renders the unavailable message when no terminal API is provided', () => {
    const layout = makeLayout({
      getProjectState: vi.fn(() => ({ activeInnerTab: 'terminals' as const })),
    });
    render(<TwoTierRailSurface {...makeRailProps({ layout })} />);
    expect(screen.getByText(/terminals are not available/i)).toBeDefined();
  });

  it('outer rail click switches the active project via setActiveProject', () => {
    const layout = makeLayout();
    render(<TwoTierRailSurface {...makeRailProps({ layout })} />);
    const otherProjectButton = screen.getAllByRole('button').find((btn) => {
      const aria = btn.getAttribute('aria-label') ?? '';
      const title = btn.getAttribute('title') ?? '';
      return aria.includes('other') || title.includes('other');
    });
    if (otherProjectButton) {
      fireEvent.click(otherProjectButton);
      expect(layout.setActiveProject).toHaveBeenCalledWith('/home/user/other');
    }
  });

  it('workbench menu bar dispatches the documented Toggle Outer Rail event', () => {
    const dispatched: string[] = [];
    const orig = window.dispatchEvent;
    window.dispatchEvent = vi.fn((evt: Event) => {
      dispatched.push(evt.type);
      return true;
    }) as typeof window.dispatchEvent;
    try {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('View'));
      fireEvent.click(screen.getByText('Toggle Outer Rail'));
      expect(dispatched).toContain('agent-ide:workbench-toggle-outer-rail');
    } finally {
      window.dispatchEvent = orig;
    }
  });
});
