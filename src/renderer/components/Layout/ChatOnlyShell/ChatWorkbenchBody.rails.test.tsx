/**
 * @vitest-environment jsdom
 *
 * Smoke tests for ChatWorkbenchBody.rails:
 *   - TwoTierRailSurface always renders OuterProjectRail
 *   - Inner sidebar reflects the active project
 *   - + New chat triggers handleCreateSession with the active project root
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test', projectRoots: ['/test'], addProjectRoot: vi.fn() }),
}));
vi.mock('../../../hooks/useConfig', () => ({
  useConfig: () => ({ config: { recentProjects: [] } }),
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

import { TwoTierRailSurface, type TwoTierRailSurfaceProps } from './ChatWorkbenchBody.rails';
import type { ChatWorkbenchLayoutApi } from './useChatWorkbenchLayout';

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
    sessionCrud: {
      list: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
      active: vi.fn().mockResolvedValue({ success: true, sessionId: null }),
      onChanged: vi.fn().mockReturnValue(() => {}),
    },
  } as typeof window.electronAPI;
});

afterEach(cleanup);

function makeProps(overrides: Partial<TwoTierRailSurfaceProps> = {}): TwoTierRailSurfaceProps {
  return {
    layout: makeLayout(),
    sessionsState: {
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      refresh: vi.fn(),
    } as never,
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
  it('renders OuterProjectRail when no project is active', () => {
    render(<TwoTierRailSurface {...makeProps()} />);
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    expect(screen.queryByTestId('outer-session-rail')).toBeNull();
  });

  it('still renders OuterProjectRail (not session rail) when a project is active', () => {
    const layout = makeLayout({ activeProject: '/proj/alpha' });
    render(<TwoTierRailSurface {...makeProps({ layout })} />);
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    expect(screen.queryByTestId('outer-session-rail')).toBeNull();
  });

  it('+ New chat in the inner sidebar triggers handleCreateSession with the active project root', () => {
    const handleCreateSession = vi.fn().mockResolvedValue(undefined);
    const layout = makeLayout({ activeProject: '/proj/alpha' });
    render(
      <TwoTierRailSurface
        {...makeProps({
          layout,
          handlers: {
            handleCreateSession,
            handleLaunchAgent: vi.fn(),
            handleSelectSession: vi.fn(),
            handleSelectRecentChat: vi.fn(),
          },
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('inner-chats-new-chat'));
    expect(handleCreateSession).toHaveBeenCalledWith('/proj/alpha');
  });
});
