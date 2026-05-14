/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../contexts/ToastContext';
import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';

const mockSelectThread = vi.fn();
const mockRefreshSessions = vi.fn();
const mockActivateSession = vi.fn();
let mockCompareTarget: null | {
  sessionId: string;
  projectRoot: string;
  threadId: string;
  projectLabel: string;
} = null;
let approvalRequests = [] as Array<{
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}>;
let diffState: null | {
  sessionId: string;
  snapshotHash: string;
  files: Array<{ hunks: Array<{ decision: 'pending' | 'accepted' | 'rejected' }> }>;
} = null;
let currentSessions = [] as Array<{
  id: string;
  taskLabel: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: Array<{
    id: string;
    toolName: string;
    input: string;
    timestamp: number;
    status: 'pending' | 'success' | 'error';
  }>;
  parentSessionId?: string;
}>;

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({
    pendingCount: approvalRequests.length,
    requests: approvalRequests,
  }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions,
    historicalSessions: [],
    agents: currentSessions,
    activeCount: currentSessions.filter((session) => session.status === 'running').length,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
  }),
}));

// Wave 59: TwoTierRailSurface (workbench is now the chat shell) reads
// project list + config + file viewer. Mock those cross-subsystem deps.
vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    projectRoot: '/test/project',
    projectName: 'project',
    projectRoots: ['/test/project'],
    addProjectRoot: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useConfig', () => ({
  useConfig: () => ({ config: { recentProjects: [] } }),
}));
vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({ pendingCount: approvalRequests.length, requests: approvalRequests }),
}));
vi.mock('../../FileViewer/FileViewerManager', () => ({
  useFileViewerManager: () => ({ openFile: vi.fn(), activeFile: null, openFiles: [] }),
}));
vi.mock('../../FileTree/FileTree', () => ({
  FileTree: () => <div data-testid="mock-file-tree" />,
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({
    state: diffState,
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

vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => <div data-testid="agent-chat-workspace" />,
}));

vi.mock('../../AgentChat/agentChatStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../AgentChat/agentChatStore')>();
  return {
    ...actual,
    useAgentChatStoreContext: (
      selector: (state: {
        threads: Array<{
          id: string;
          title: string;
          createdAt: number;
          updatedAt: number;
          lastActivityAt: number;
          status: 'complete';
          projectId: string;
          workspaceRoot: string;
        }>;
        onSelectThread: typeof mockSelectThread;
      }) => unknown,
    ) =>
      selector({
        threads: [
          {
            id: 'thread-1',
            title: 'Thread One',
            createdAt: 1,
            updatedAt: 2,
            lastActivityAt: 2,
            status: 'complete',
            projectId: 'project-1',
            workspaceRoot: '/test/project',
            messages: [],
          } as never,
        ],
        onSelectThread: mockSelectThread,
      }),
  };
});

vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({
    sessions: [
      {
        id: 'session-1',
        projectRoot: '/test/project',
        branchName: 'main',
        createdAt: 1,
        updatedAt: 2,
        lastAccessedAt: 2,
        isActive: true,
        metadata: {},
      },
    ],
    refresh: mockRefreshSessions,
  }),
}));

vi.mock('./useWorkbenchSessionActivation', () => ({
  useWorkbenchSessionActivation: () => ({
    activateSession: mockActivateSession,
    activatingSessionId: null,
  }),
}));

vi.mock('./useWorkbenchSessions', () => ({
  useWorkbenchSessions: () => ({
    items: [],
    activeItems: [],
    backgroundItems: [],
    activeSessionId: 'session-1',
    isLoading: false,
    refresh: mockRefreshSessions,
  }),
}));

vi.mock('./useWorkbenchCompare', () => ({
  useWorkbenchCompare: () => ({
    compareTarget: mockCompareTarget,
    isComparing: mockCompareTarget !== null,
    canCompare: vi.fn(() => true),
    openCompare: vi.fn(),
    closeCompare: vi.fn(),
  }),
}));

vi.mock('./ChatWorkbenchComparePane', () => ({
  ChatWorkbenchComparePane: () => <div data-testid="chat-workbench-compare-pane" />,
}));

vi.mock('./ChatOnlyTitleBar', () => ({
  ChatOnlyTitleBar: () => <div data-testid="chat-only-title-bar" />,
}));

vi.mock('./ChatOnlyStatusBar', () => ({
  ChatOnlyStatusBar: () => <div data-testid="chat-only-status-bar" />,
}));

vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: () => <div data-testid="diff-overlay" />,
}));

vi.mock('./ChatOnlySettingsOverlay', () => ({
  ChatOnlySettingsOverlay: () => <div data-testid="settings-overlay" />,
}));

vi.mock('./KeyboardShortcutCheatSheet', () => ({
  KeyboardShortcutCheatSheet: () => <div data-testid="cheat-sheet" />,
}));

vi.mock('../../CommandPalette/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}));

vi.mock('./WorkbenchRail', () => ({
  WorkbenchRail: () => <div data-testid="workbench-rail" />,
}));

vi.mock('./useChatSidebarMode', () => ({
  useChatSidebarMode: () => ({ mode: 'pinned', cycleMode: vi.fn() }),
}));

vi.mock('./useWorkbenchArtifacts', () => ({
  useWorkbenchArtifacts: () => ({
    kind: 'empty',
    activeKey: null,
    title: 'Artifacts',
    subtitle: null,
    hasArtifact: false,
  }),
}));

function renderShell() {
  return render(
    <ToastProvider>
      <ChatWorkbenchShell
        projectRoot="/test/project"
        diffOverlayOpen={false}
        openDiffOverlay={vi.fn()}
        closeDiffOverlay={vi.fn()}
        toggleDrawer={vi.fn()}
        paletteOpen={false}
        closePalette={vi.fn()}
        commands={[]}
        recentIds={[]}
        execute={vi.fn().mockResolvedValue(undefined)}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  approvalRequests = [];
  diffState = null;
  currentSessions = [];
  mockCompareTarget = null;
  mockSelectThread.mockReset();
  mockRefreshSessions.mockReset();
  mockActivateSession.mockReset();
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
    sessionCrud: {
      active: vi.fn().mockResolvedValue({ success: false, sessionId: null }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
  } as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
});

describe('ChatWorkbenchShell integration', () => {
  it('shows a compact background approval prompt when a new approval arrives', () => {
    const view = renderShell();
    expect(screen.queryByTestId('chat-workbench-utility-drawer')).toBeNull();

    approvalRequests = [
      {
        requestId: 'req-1',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        sessionId: 'session-1',
        timestamp: Date.now(),
      },
    ];
    view.rerender(
      <ToastProvider>
        <ChatWorkbenchShell
          projectRoot="/test/project"
          diffOverlayOpen={false}
          openDiffOverlay={vi.fn()}
          closeDiffOverlay={vi.fn()}
          toggleDrawer={vi.fn()}
          paletteOpen={false}
          closePalette={vi.fn()}
          commands={[]}
          recentIds={[]}
          execute={vi.fn().mockResolvedValue(undefined)}
        />
      </ToastProvider>,
    );

    expect(screen.getByTestId('workbench-background-approval-prompt')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
  });

  it('auto-opens the review tab when diff review becomes active', () => {
    const view = renderShell();
    diffState = {
      sessionId: 'session-1',
      snapshotHash: 'abc',
      files: [{ hunks: [{ decision: 'pending' }] }],
    };
    view.rerender(
      <ChatWorkbenchShell
        projectRoot="/test/project"
        diffOverlayOpen={false}
        openDiffOverlay={vi.fn()}
        closeDiffOverlay={vi.fn()}
        toggleDrawer={vi.fn()}
        paletteOpen={false}
        closePalette={vi.fn()}
        commands={[]}
        recentIds={[]}
        execute={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-utility-tab-review')).toBeDefined();
    expect(screen.getByTestId('diff-review-panel')).toBeDefined();
  });

  it('switches to the subagents tab when a subagent-open event fires', () => {
    currentSessions = [
      {
        id: 'child-1',
        taskLabel: 'Investigate',
        status: 'running',
        startedAt: Date.now(),
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: [],
        parentSessionId: 'parent-1',
      },
    ];
    renderShell();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tc-1' } }),
      );
    });

    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-utility-tab-monitor')).toBeDefined();
  });
});
