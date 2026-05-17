/**
 * @vitest-environment jsdom
 *
 * Smoke tests for ChatWorkbenchBody — verifies prop-driven layout contract:
 * - rail visible when layout.railOpen === true
 * - rail hidden when layout.railOpen === false
 * - dock prop is forwarded (terminal surface conditionally rendered)
 *
 * The full cross-subsystem joins are covered by
 * ChatWorkbenchFollowThrough.integration.test.tsx.
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── External boundary mocks ───────────────────────────────────────────────────

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({
    pendingCount: 0,
    requests: [],
    approve: vi.fn(),
    reject: vi.fn(),
    alwaysAllow: vi.fn(),
  }),
}));
vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions: [],
    historicalSessions: [],
    agents: [],
    activeCount: 0,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
  }),
}));
vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null, canRollback: false }),
}));
vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: () => <div data-testid="diff-review-panel" />,
}));
vi.mock('../../AgentChat/agentChatStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../AgentChat/agentChatStore')>();
  return {
    ...actual,
    useAgentChatStoreContext: (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ threads: [], onSelectThread: vi.fn(), activeThread: null }),
  };
});
vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({ sessions: [], activeSessionId: null, refresh: vi.fn() }),
}));
vi.mock('./useWorkbenchSessionActivation', () => ({
  useWorkbenchSessionActivation: () => ({
    activateSession: vi.fn().mockResolvedValue(undefined),
    activatingSessionId: null,
  }),
}));
vi.mock('../../FileViewer/FileViewerManager', () => ({
  useFileViewerManager: () => ({
    activeFile: null,
    openFiles: [],
    openFile: vi.fn(),
    closeFile: vi.fn(),
    saveFile: vi.fn(),
  }),
  FileViewerManager: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../hooks/useRulesAndSkills', () => ({
  useRulesAndSkills: () => ({
    rules: [],
    commands: [],
    isLoading: false,
    refresh: vi.fn(),
    createRule: vi.fn().mockResolvedValue(null),
  }),
}));
vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test', projectRoots: ['/test'], addProjectRoot: vi.fn() }),
}));
vi.mock('../../../hooks/useConfig', () => ({
  useConfig: () => ({ config: { recentProjects: [] } }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { ChatWorkbenchLayoutApi, ChatWorkbenchLayoutState } from './useChatWorkbenchLayout';
import type { TerminalDockApi } from './useTerminalDockState';

function makeLayout(overrides: Partial<ChatWorkbenchLayoutState> = {}): ChatWorkbenchLayoutApi {
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

function makeDock(overrides: Partial<TerminalDockApi> = {}): TerminalDockApi {
  return {
    visible: false,
    height: 240,
    toggleVisible: vi.fn(),
    setVisible: vi.fn(),
    setHeight: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const { ChatWorkbenchBody } = await import('./ChatWorkbenchBody');

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
    rulesAndSkills: {
      listRuleFiles: vi.fn().mockResolvedValue({ success: true, ruleFiles: [] }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
  } as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ChatWorkbenchBody — layout prop contract', () => {
  it('renders the two-tier rail when layout.railOpen is true', () => {
    render(
      <ChatWorkbenchBody
        layout={makeLayout({ railOpen: true })}
        dock={makeDock()}
        projectRoot="/test"
      />,
    );
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    expect(screen.getByTestId('inner-sidebar')).toBeDefined();
  });

  it('hides the two-tier rail when layout.railOpen is false', () => {
    render(
      <ChatWorkbenchBody
        layout={makeLayout({ railOpen: false })}
        dock={makeDock()}
        projectRoot="/test"
      />,
    );
    expect(screen.queryByTestId('outer-project-rail')).toBeNull();
    expect(screen.queryByTestId('inner-sidebar')).toBeNull();
  });

  it('renders the dock-main-area regardless of rail state (terminal-first, Phase 4b)', () => {
    // Wave 89 Phase 4b: AgentChatWorkspace is no longer mounted in the shell body.
    // The dock-main-area wrapper is the primary content area.
    render(
      <ChatWorkbenchBody
        layout={makeLayout({ railOpen: false })}
        dock={makeDock()}
        projectRoot="/test"
      />,
    );
    expect(screen.queryByTestId('agent-chat-workspace')).toBeNull();
    expect(screen.getByTestId('workbench-dock-main-area')).toBeDefined();
  });

  it('dock-main-area is always rendered (dock fills the shell, no conditional mounting)', () => {
    // Phase 4b: the dock is the main content area and always renders.
    // The old dock.visible conditional is gone; visibility is now a toggle
    // on the DockCloseButton rather than hiding the entire area.
    render(
      <ChatWorkbenchBody
        layout={makeLayout()}
        dock={makeDock({ visible: false })}
        projectRoot="/test"
      />,
    );
    expect(screen.getByTestId('workbench-dock-main-area')).toBeDefined();
    expect(screen.queryByTestId('chat-workbench-terminal-dock-unavailable')).toBeNull();
  });

  it('dock-main-area is present when dock is visible', () => {
    render(
      <ChatWorkbenchBody
        layout={makeLayout()}
        dock={makeDock({ visible: true })}
        projectRoot="/test"
      />,
    );
    expect(screen.getByTestId('workbench-dock-main-area')).toBeDefined();
    expect(screen.queryByTestId('chat-workbench-terminal-dock-unavailable')).toBeNull();
  });
});

describe('ChatWorkbenchBody — mobile overlay mode', () => {
  function mockMobile(matches: boolean): void {
    window.matchMedia = ((q: string) => ({
      matches: matches && q.includes('max-width'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as unknown as typeof window.matchMedia;
  }

  it('renders the rail inside an overlay on mobile when railOpen is true', () => {
    mockMobile(true);
    render(
      <ChatWorkbenchBody
        layout={makeLayout({ railOpen: true })}
        dock={makeDock()}
        projectRoot="/test"
      />,
    );
    expect(screen.getByTestId('workbench-left-overlay')).toBeDefined();
    expect(screen.getByTestId('workbench-left-overlay-scrim')).toBeDefined();
    // Body marker
    expect(screen.getByTestId('chat-workbench-body').getAttribute('data-mobile')).toBe('true');
  });

  it('omits the rail overlay on mobile when railOpen is false', () => {
    mockMobile(true);
    render(
      <ChatWorkbenchBody
        layout={makeLayout({ railOpen: false })}
        dock={makeDock()}
        projectRoot="/test"
      />,
    );
    expect(screen.queryByTestId('workbench-left-overlay')).toBeNull();
  });

  it('does not switch to overlay mode when viewport is desktop-sized', () => {
    mockMobile(false);
    render(
      <ChatWorkbenchBody
        layout={makeLayout({ railOpen: true })}
        dock={makeDock()}
        projectRoot="/test"
      />,
    );
    expect(screen.queryByTestId('workbench-left-overlay')).toBeNull();
    expect(screen.getByTestId('chat-workbench-body').getAttribute('data-mobile')).toBeNull();
  });
});
