/**
 * @vitest-environment jsdom
 *
 * ChatWorkbenchShell — smoke tests (Wave 46 Phase A + Phase C).
 *
 * Verifies:
 *  - Renders shell chrome (title bar, status bar, body).
 *  - Body is present even when terminal prop is omitted.
 *  - Terminal dock is only mounted when dock.visible && terminal is provided.
 *  - Terminal-unavailable placeholder shows when dock is visible but terminal is missing.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { AgentChatThreadRecord } from '../../../types/electron';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';

let mockDockVisible = false;
let mockArtifactOpen = false;
let mockUtilityOpen = false;
let mockArtifactKey: string | null = null;
let mockArtifactKind: 'empty' | 'file' | 'diff' = 'empty';
let mockPendingCount = 0;
let mockApprovalRequests: Array<{
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}> = [];
let mockDiffState: null | { sessionId: string; snapshotHash: string } = null;
let mockActiveUtilityTab: 'activity' | 'review' | 'approvals' | 'subagents' = 'activity';
const mockSetArtifactOpen = vi.fn();
const mockSetUtilityOpen = vi.fn();
const mockSetActiveUtilityTab = vi.fn();
const mockSelectThread = vi.fn();
const mockRefreshSessions = vi.fn();
const mockActivateSession = vi.fn();
const mockCreateStoredSessionFromPicker = vi.fn();
let mockCompareTarget: null | {
  sessionId: string;
  projectRoot: string;
  threadId: string;
  projectLabel: string;
} = null;
const mockOpenCompare = vi.fn();
const mockCloseCompare = vi.fn();

const mockThreads: AgentChatThreadRecord[] = [
  {
    id: 'thread-1',
    title: 'Thread One',
    createdAt: 1,
    updatedAt: 2,
    lastActivityAt: 2,
    status: 'complete',
    projectId: 'project-1',
    workspaceRoot: '/test/project',
  },
];

const mockSessions = [
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
];

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({ pendingCount: mockPendingCount, requests: mockApprovalRequests }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: mockDiffState }),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => <div data-testid="agent-chat-workspace" />,
}));

vi.mock('../../AgentChat/agentChatStore', () => ({
  useAgentChatStoreContext: (
    selector: (state: {
      threads: AgentChatThreadRecord[];
      onSelectThread: typeof mockSelectThread;
    }) => unknown,
  ) => selector({ threads: mockThreads, onSelectThread: mockSelectThread }),
}));

vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({
    sessions: mockSessions,
    refresh: mockRefreshSessions,
  }),
}));

vi.mock('../../SessionSidebar/NewSessionButton', () => ({
  createStoredSessionFromPicker: () => mockCreateStoredSessionFromPicker(),
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
  WorkbenchRail: ({
    onCreateSession,
    onSelectSession,
    onSelectRecentChat,
  }: {
    onCreateSession: () => void;
    onSelectSession: (sessionId: string) => void;
    onSelectRecentChat?: (threadId: string) => void;
  }) => (
    <div data-testid="workbench-rail">
      <button type="button" data-testid="workbench-rail-create" onClick={onCreateSession}>
        Create
      </button>
      <button
        type="button"
        data-testid="workbench-rail-select"
        onClick={() => onSelectSession('session-1')}
      >
        Select
      </button>
      <button
        type="button"
        data-testid="workbench-rail-recent-chat"
        onClick={() => onSelectRecentChat?.('thread-1')}
      >
        Recent Chat
      </button>
    </div>
  ),
}));

vi.mock('./useChatSidebarMode', () => ({
  useChatSidebarMode: () => ({ mode: 'pinned', cycleMode: vi.fn() }),
}));

vi.mock('./useChatWorkbenchLayout', () => ({
  useChatWorkbenchLayout: () => ({
    railOpen: true,
    artifactOpen: mockArtifactOpen,
    utilityOpen: mockUtilityOpen,
    activeUtilityTab: mockActiveUtilityTab,
    toggleRail: vi.fn(),
    setRailOpen: vi.fn(),
    toggleArtifact: vi.fn(),
    setArtifactOpen: mockSetArtifactOpen,
    toggleUtility: vi.fn(),
    setUtilityOpen: mockSetUtilityOpen,
    setActiveUtilityTab: mockSetActiveUtilityTab,
  }),
}));

vi.mock('./useTerminalDockState', () => ({
  useTerminalDockState: () => ({
    visible: mockDockVisible,
    height: 240,
    toggleVisible: vi.fn(),
    setVisible: vi.fn(),
    setHeight: vi.fn(),
  }),
  TERMINAL_DOCK_CONSTANTS: { MIN_HEIGHT: 120, MAX_HEIGHT: 600, DEFAULT_HEIGHT: 240 },
}));

vi.mock('./ChatWorkbenchTerminalDock', () => ({
  ChatWorkbenchTerminalDock: () => <div data-testid="chat-workbench-terminal-dock" />,
}));

vi.mock('./ChatWorkbenchArtifactPane', () => ({
  ChatWorkbenchArtifactPane: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="chat-workbench-artifact-pane">
      <button type="button" data-testid="chat-workbench-artifact-pane-close" onClick={onClose}>
        Close Artifact
      </button>
    </div>
  ),
}));

vi.mock('./ChatWorkbenchUtilityDrawer', () => ({
  ChatWorkbenchUtilityDrawer: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="chat-workbench-utility-drawer">
      <button type="button" data-testid="chat-workbench-utility-drawer-close" onClick={onClose}>
        Close Utility
      </button>
    </div>
  ),
}));

vi.mock('./useWorkbenchArtifacts', () => ({
  useWorkbenchArtifacts: () => ({
    kind: mockArtifactKind,
    activeKey: mockArtifactKey,
    title: 'Artifacts',
    subtitle: null,
    hasArtifact: mockArtifactKind !== 'empty',
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
    refresh: vi.fn(),
  }),
}));

vi.mock('./useWorkbenchCompare', () => ({
  useWorkbenchCompare: () => ({
    compareTarget: mockCompareTarget,
    isComparing: mockCompareTarget !== null,
    canCompare: vi.fn(() => true),
    openCompare: mockOpenCompare,
    closeCompare: mockCloseCompare,
  }),
}));

vi.mock('./ChatWorkbenchComparePane', () => ({
  ChatWorkbenchComparePane: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="chat-workbench-compare-pane">
      <button type="button" data-testid="chat-workbench-compare-close" onClick={onClose}>
        Close Compare
      </button>
    </div>
  ),
}));

function makeTerminal(): UseTerminalSessionsReturn {
  return {
    sessions: [],
    activeSessionId: null,
    setActiveSessionId: vi.fn(),
    recordingSessions: new Set<string>(),
    spawnSession: vi.fn().mockResolvedValue(undefined),
    spawnClaudeSession: vi.fn().mockResolvedValue(undefined),
    spawnCodexSession: vi.fn().mockResolvedValue(undefined),
    handleTerminalClose: vi.fn(),
    handleTerminalRestart: vi.fn().mockResolvedValue(undefined),
    handleTerminalTitleChange: vi.fn(),
    handleToggleRecording: vi.fn().mockResolvedValue(undefined),
    handleSplit: vi.fn().mockResolvedValue(undefined),
    handleCloseSplit: vi.fn(),
    handleTerminalReorder: vi.fn(),
  };
}

function renderShell(terminal?: UseTerminalSessionsReturn) {
  return render(
    <ChatWorkbenchShell
      projectRoot="/test/project"
      terminal={terminal}
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
}

function rerenderShell(
  rerender: ReturnType<typeof renderShell>['rerender'],
  terminal?: UseTerminalSessionsReturn,
): void {
  rerender(
    <ChatWorkbenchShell
      projectRoot="/test/project"
      terminal={terminal}
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
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockDockVisible = false;
  mockArtifactOpen = false;
  mockUtilityOpen = false;
  mockArtifactKey = null;
  mockArtifactKind = 'empty';
  mockPendingCount = 0;
  mockApprovalRequests = [];
  mockDiffState = null;
  mockActiveUtilityTab = 'activity';
  mockSetArtifactOpen.mockReset();
  mockSetUtilityOpen.mockReset();
  mockSetActiveUtilityTab.mockReset();
  mockSelectThread.mockReset();
  mockRefreshSessions.mockReset();
  mockActivateSession.mockReset();
  mockCreateStoredSessionFromPicker.mockReset();
  mockCompareTarget = null;
  mockOpenCompare.mockReset();
  mockCloseCompare.mockReset();
});

describe('ChatWorkbenchShell', () => {
  it('renders shell chrome and body', () => {
    renderShell();
    expect(screen.getByTestId('chat-workbench-shell')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-body')).toBeDefined();
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();
    expect(screen.getByTestId('chat-only-status-bar')).toBeDefined();
    expect(screen.getByTestId('agent-chat-workspace')).toBeDefined();
  });

  it('does not mount the terminal dock when dock.visible is false', () => {
    mockDockVisible = false;
    renderShell(makeTerminal());
    expect(screen.queryByTestId('chat-workbench-terminal-dock')).toBeNull();
    expect(screen.queryByTestId('chat-workbench-terminal-dock-unavailable')).toBeNull();
  });

  it('mounts the terminal dock when dock.visible and terminal is provided', async () => {
    mockDockVisible = true;
    renderShell(makeTerminal());
    // The dock is lazy-loaded — wait for Suspense to resolve.
    const dock = await screen.findByTestId('chat-workbench-terminal-dock');
    expect(dock).toBeDefined();
    expect(screen.queryByTestId('chat-workbench-terminal-dock-unavailable')).toBeNull();
  });

  it('shows unavailable placeholder when dock is visible but terminal is missing', () => {
    mockDockVisible = true;
    renderShell(undefined);
    expect(screen.queryByTestId('chat-workbench-terminal-dock')).toBeNull();
    expect(screen.getByTestId('chat-workbench-terminal-dock-unavailable')).toBeDefined();
  });

  it('mounts the artifact pane when artifactOpen is enabled', async () => {
    mockArtifactOpen = true;
    renderShell();
    expect(await screen.findByTestId('chat-workbench-artifact-pane')).toBeDefined();
  });

  it('auto-opens the artifact pane when a new artifact key becomes active', () => {
    mockArtifactKind = 'diff';
    mockArtifactKey = 'diff:session-1:snapshot-1';
    renderShell();
    expect(mockSetArtifactOpen).toHaveBeenCalledWith(true);
  });

  it('auto-opens the artifact pane for file artifacts as well', () => {
    mockArtifactKind = 'file';
    mockArtifactKey = 'file:/tmp/example.ts';
    renderShell();
    expect(mockSetArtifactOpen).toHaveBeenCalledWith(true);
  });

  it('activates the selected rail session', () => {
    renderShell();
    fireEvent.click(screen.getByTestId('workbench-rail-select'));
    expect(mockActivateSession).toHaveBeenCalledWith('session-1');
  });

  it('creates and activates a new session from the rail', async () => {
    mockCreateStoredSessionFromPicker.mockResolvedValue({ id: 'session-created' });
    mockActivateSession.mockResolvedValue(true);
    renderShell();
    fireEvent.click(screen.getByTestId('workbench-rail-create'));
    expect(mockCreateStoredSessionFromPicker).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockActivateSession).toHaveBeenCalledWith('session-created');
    });
  });

  it('selects a recent chat directly from the rail', () => {
    renderShell();
    fireEvent.click(screen.getByTestId('workbench-rail-recent-chat'));
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1');
  });

  it('renders a compare pane when a secondary compare target is active', () => {
    mockCompareTarget = {
      sessionId: 'session-2',
      projectRoot: '/test/project-2',
      threadId: 'thread-2',
      projectLabel: 'project-2',
    };
    renderShell();
    expect(screen.getByTestId('chat-workbench-compare-pane')).toBeDefined();
  });

  it('closes compare mode through the secondary pane control', () => {
    mockCompareTarget = {
      sessionId: 'session-2',
      projectRoot: '/test/project-2',
      threadId: 'thread-2',
      projectLabel: 'project-2',
    };
    renderShell();
    fireEvent.click(screen.getByTestId('chat-workbench-compare-close'));
    expect(mockCloseCompare).toHaveBeenCalledTimes(1);
  });

  it('does not auto-open the approvals utility tab', () => {
    mockPendingCount = 1;
    renderShell();
    expect(mockSetUtilityOpen).not.toHaveBeenCalledWith(true);
    expect(mockSetActiveUtilityTab).not.toHaveBeenCalledWith('approvals');
  });

  it('shows a compact prompt for background approvals', () => {
    mockApprovalRequests = [
      {
        requestId: 'req-1',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        sessionId: 'session-background',
        timestamp: Date.now(),
      },
    ];
    renderShell();
    expect(screen.getByTestId('workbench-background-approval-prompt')).toBeDefined();
  });

  it('auto-opens the review utility tab for a diff review', () => {
    mockDiffState = { sessionId: 'session-1', snapshotHash: 'hash-1' };
    renderShell();
    expect(mockSetUtilityOpen).toHaveBeenCalledWith(true);
    expect(mockSetActiveUtilityTab).toHaveBeenCalledWith('review');
  });

  it('suppresses reopening the same artifact key after dismissal, but reopens on a new key', async () => {
    mockArtifactOpen = true;
    mockArtifactKind = 'file';
    mockArtifactKey = 'file:/tmp/example-a.ts';
    const view = renderShell();
    const initialOpenCalls = mockSetArtifactOpen.mock.calls.length;

    fireEvent.click(await screen.findByTestId('chat-workbench-artifact-pane-close'));
    expect(mockSetArtifactOpen).toHaveBeenLastCalledWith(false);

    mockArtifactOpen = false;
    mockSetArtifactOpen.mockClear();
    rerenderShell(view.rerender);
    expect(mockSetArtifactOpen.mock.calls.length).toBeLessThanOrEqual(initialOpenCalls);

    mockArtifactKey = null;
    rerenderShell(view.rerender);

    mockArtifactKey = 'file:/tmp/example-a.ts';
    rerenderShell(view.rerender);
    expect(mockSetArtifactOpen).not.toHaveBeenCalledWith(true);

    mockArtifactKey = 'file:/tmp/example-b.ts';
    rerenderShell(view.rerender);
    expect(mockSetArtifactOpen).toHaveBeenCalledWith(true);
  });

  it('suppresses reopening the same subagent event after dismissal, but reopens for a new tool call', async () => {
    mockUtilityOpen = true;
    renderShell();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tool-1' } }),
      );
    });
    expect(mockSetUtilityOpen).toHaveBeenCalledWith(true);
    expect(mockSetActiveUtilityTab).toHaveBeenCalledWith('subagents');

    mockSetUtilityOpen.mockClear();
    mockSetActiveUtilityTab.mockClear();
    fireEvent.click(await screen.findByTestId('chat-workbench-utility-drawer-close'));
    expect(mockSetUtilityOpen).toHaveBeenLastCalledWith(false);

    mockUtilityOpen = false;
    mockSetUtilityOpen.mockClear();
    mockSetActiveUtilityTab.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tool-1' } }),
      );
    });
    expect(mockSetUtilityOpen).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tool-2' } }),
      );
    });
    expect(mockSetUtilityOpen).toHaveBeenCalledWith(true);
    expect(mockSetActiveUtilityTab).toHaveBeenCalledWith('subagents');
  });
});
