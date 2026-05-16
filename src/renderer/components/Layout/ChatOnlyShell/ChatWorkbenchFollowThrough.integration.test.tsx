/**
 * @vitest-environment jsdom
 *
 * Wave 58 rewrite of the Wave 47 follow-through integration tests.
 *
 * ANTI-PATTERN REMOVED: Wave 47 mocked useWorkbenchArtifacts and
 * ChatWorkbenchComparePane (both defined inside ChatOnlyShell/), then
 * asserted mocked stubs appeared. Those tests proved nothing about real joins.
 *
 * WHAT IS MOCKED HERE (platform / external boundaries only):
 * - window.electronAPI — IPC bridge; not under test
 * - AgentChatWorkspace — lives in AgentChat/, not ChatOnlyShell/; carries
 *   xterm/Monaco cost that jsdom cannot render
 * - useFileViewerManager — FileViewer context provider; boundary to FileViewer
 *   subsystem. useWorkbenchArtifacts (inside ChatOnlyShell/) is NOT mocked.
 * - useDiffReview — DiffReview context provider; boundary to DiffReview subsystem
 * - AgentEventsContext, ApprovalContext — global providers above the shell
 * - agentChatStore — per-workspace store; provide controlled test state
 * - useSessions — session IPC bridge; not in ChatOnlyShell/
 * - Heavy overlays (TitleBar, StatusBar, CommandPalette) — structural chrome with
 *   no logic under test here
 *
 * WHAT IS NOT MOCKED (real joins exercised):
 * - WorkbenchRail, WorkbenchRailSections, WorkbenchSessionRow
 * - ChatWorkbenchUtilityDrawer (all tabs including rules)
 * - ChatWorkbenchBody, ChatWorkbenchBody.model, ChatWorkbenchBody.parts
 * - useWorkbenchSurfacePolicy, useWorkbenchArtifacts, useWorkbenchCompare
 * - useChatWorkbenchLayout, useWorkbenchSessions, useWorkbenchAttention
 * - WorkbenchTimelinePanel, WorkbenchApprovalPanel
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../contexts/ToastContext';
import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';

// ── Platform / external boundary mocks ─────────────────────────────────────

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({
    pendingCount: 0,
    requests: [],
    approve: vi.fn(),
    reject: vi.fn(),
    alwaysAllow: vi.fn(),
  }),
}));

let mockSessions: Array<{
  id: string;
  taskLabel: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  startedAt: number;
  toolCalls: never[];
  inputTokens: number;
  outputTokens: number;
  parentSessionId?: string;
}> = [];

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions: mockSessions.filter((s) => s.status === 'running' || s.status === 'idle'),
    historicalSessions: mockSessions.filter((s) => s.status === 'complete' || s.status === 'error'),
    agents: mockSessions,
    activeCount: mockSessions.filter((s) => s.status === 'running').length,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
  }),
}));

// useDiffReview is a DiffReview-subsystem boundary; not part of ChatOnlyShell/
vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null, canRollback: false }),
}));

vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: () => <div data-testid="diff-review-panel" />,
}));

// AgentChatWorkspace lives in AgentChat/ (not ChatOnlyShell/) and carries
// xterm/Monaco cost jsdom cannot render
vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => <div data-testid="agent-chat-workspace" />,
}));

vi.mock('../../AgentChat/agentChatStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../AgentChat/agentChatStore')>();
  return {
    ...actual,
    useAgentChatStoreContext: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        threads: [],
        onSelectThread: vi.fn(),
        activeThread: null,
      }),
  };
});

vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    activeSessionId: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('./useWorkbenchSessionActivation', () => ({
  useWorkbenchSessionActivation: () => ({
    activateSession: vi.fn().mockResolvedValue(undefined),
    activatingSessionId: null,
  }),
}));

// useFileViewerManager is the FileViewer subsystem boundary. useWorkbenchArtifacts
// (inside ChatOnlyShell/) reads from this — NOT mocked itself.
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

// Structural chrome not under test
vi.mock('./ChatOnlyTitleBar', () => ({
  ChatOnlyTitleBar: () => <div data-testid="chat-only-title-bar" />,
}));
vi.mock('./ChatOnlyStatusBar', () => ({
  ChatOnlyStatusBar: () => <div data-testid="chat-only-status-bar" />,
}));
vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: () => null,
}));
vi.mock('./ChatOnlySettingsOverlay', () => ({
  ChatOnlySettingsOverlay: () => null,
}));
vi.mock('./KeyboardShortcutCheatSheet', () => ({
  KeyboardShortcutCheatSheet: () => null,
}));
vi.mock('../../CommandPalette/CommandPalette', () => ({
  CommandPalette: () => null,
}));
vi.mock('./useChatSidebarMode', () => ({
  useChatSidebarMode: () => ({ mode: 'pinned', cycleMode: vi.fn() }),
}));
vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test/project', projectRoots: ['/test/project'] }),
}));
vi.mock('../../FileTree/FileTree', () => ({
  FileTree: () => <div data-testid="mock-file-tree" />,
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

// ── Late import of shell (after all mocks are registered) ───────────────────
const { ChatWorkbenchShell } = await import('./ChatWorkbenchShell');

function buildShellProps(overrides: Record<string, unknown> = {}) {
  return {
    projectRoot: '/test/project',
    diffOverlayOpen: false,
    openDiffOverlay: vi.fn(),
    closeDiffOverlay: vi.fn(),
    toggleDrawer: vi.fn(),
    paletteOpen: false,
    closePalette: vi.fn(),
    commands: [],
    recentIds: [],
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderShell(overrides: Record<string, unknown> = {}) {
  return render(
    <ToastProvider>
      <ChatWorkbenchShell {...(buildShellProps(overrides) as Parameters<typeof ChatWorkbenchShell>[0])} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  mockSessions = [];
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
    sessionCrud: {
      active: vi.fn().mockResolvedValue({ success: false, sessionId: null }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
    rulesAndSkills: {
      listRuleFiles: vi.fn().mockResolvedValue({ success: true, ruleFiles: [] }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
  } as typeof window.electronAPI;
  // Clear persisted layout state between tests
  window.localStorage.removeItem('agent-ide:chat-workbench-layout');
});

afterEach(() => {
  cleanup();
});

// ── Rail IA — Wave 59 two-tier rail ───────────────────────────────────────────
// Wave 59 Phase B replaced WorkbenchRail (single column) with TwoTierRailSurface
// (OuterProjectRail + InnerSidebar). Multi-Session Launch is no longer surfaced
// as a rail button; it lives behind the OPEN_MULTI_SESSION_EVENT bus.
describe('Rail IA (Wave 59 two-tier rail)', () => {
  it('renders the outer project rail and inner sidebar by default', () => {
    renderShell();
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    expect(screen.getByTestId('inner-sidebar')).toBeDefined();
  });

  it('exposes a + New chat affordance in the inner sidebar when a project is active', () => {
    window.localStorage.setItem(
      'agent-ide:chat-workbench-layout',
      JSON.stringify({
        railOpen: true,
        artifactOpen: false,
        utilityOpen: false,
        activeUtilityTab: 'activity',
        activeProject: '/test/project',
        projectStates: {},
      }),
    );
    renderShell();
    const innerSidebar = screen.getByTestId('inner-sidebar');
    const labels = within(innerSidebar)
      .queryAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(labels.some((l) => /new chat/i.test(l))).toBe(true);
  });

  it('renders without crashing when sessions are present', () => {
    mockSessions = [
      {
        id: 'ses-1',
        taskLabel: 'My Session',
        status: 'running',
        startedAt: Date.now(),
        toolCalls: [],
        inputTokens: 0,
        outputTokens: 0,
      },
    ];
    renderShell();
    expect(screen.getByTestId('inner-sidebar')).toBeDefined();
  });
});

// ── Utility drawer — real join via surface policy ───────────────────────────
describe('Utility drawer — real surface policy join', () => {
  it('opens the utility drawer on OPEN_SUBAGENT_PANEL_EVENT', () => {
    mockSessions = [
      {
        id: 'child-1',
        taskLabel: 'Sub work',
        status: 'running',
        startedAt: Date.now(),
        toolCalls: [],
        inputTokens: 0,
        outputTokens: 0,
        parentSessionId: 'parent-1',
      },
    ];
    renderShell();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tc-1' } }),
      );
    });

    // Real ChatWorkbenchUtilityDrawer should be visible
    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
    // OPEN_SUBAGENT_PANEL_EVENT routes to the monitor tab (useWorkbenchSurfacePolicy)
    expect(screen.getByTestId('chat-workbench-utility-tab-monitor')).toBeDefined();
  });

  it('shows rules tab in real drawer tab bar', () => {
    // Force drawer open via localStorage to avoid needing a trigger
    window.localStorage.setItem(
      'agent-ide:chat-workbench-layout',
      JSON.stringify({
        railOpen: true,
        artifactOpen: false,
        utilityOpen: true,
        activeUtilityTab: 'rules',
      }),
    );
    renderShell();
    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-utility-tab-rules')).toBeDefined();
  });

  it('real close button dismisses the drawer', () => {
    window.localStorage.setItem(
      'agent-ide:chat-workbench-layout',
      JSON.stringify({
        railOpen: true,
        artifactOpen: false,
        utilityOpen: true,
        activeUtilityTab: 'activity',
      }),
    );
    renderShell();
    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();

    // Click the real close button rendered by real DrawerHeader
    const closeBtn = screen.getByTestId('chat-workbench-utility-close');
    act(() => {
      closeBtn.click();
    });

    expect(screen.queryByTestId('chat-workbench-utility-drawer')).toBeNull();
  });
});

// ── Compare mode — real useWorkbenchCompare join ─────────────────────────────
describe('Compare mode (real useWorkbenchCompare)', () => {
  it('does not show compare pane when compare is inactive', () => {
    renderShell();
    // With empty sessions, compare pane should not be visible
    expect(screen.queryByTestId('chat-workbench-compare-pane')).toBeNull();
  });
});

// ── Shell structure ───────────────────────────────────────────────────────────
describe('Shell structure', () => {
  it('renders title bar, workbench body, and status bar', () => {
    renderShell();
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-body')).toBeDefined();
    expect(screen.getByTestId('chat-only-status-bar')).toBeDefined();
  });

  it('keeps the primary conversation workspace mounted', () => {
    renderShell();
    expect(screen.getByTestId('agent-chat-workspace')).toBeDefined();
  });
});
