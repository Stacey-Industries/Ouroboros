/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';

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
}

beforeEach(() => {
  approvalRequests = [];
  diffState = null;
  currentSessions = [];
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
  } as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
});

describe('ChatWorkbenchShell integration', () => {
  it('auto-opens the approvals tab when a new approval arrives', () => {
    const view = renderShell();
    expect(screen.queryByTestId('chat-workbench-utility-drawer')).toBeNull();

    approvalRequests = [{
      requestId: 'req-1',
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      sessionId: 'session-1',
      timestamp: Date.now(),
    }];
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
    expect(screen.getByTestId('chat-workbench-utility-tab-approvals')).toBeDefined();
    expect(screen.getByTestId('workbench-approval-panel')).toBeDefined();
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
    currentSessions = [{
      id: 'child-1',
      taskLabel: 'Investigate',
      status: 'running',
      startedAt: Date.now(),
      toolCalls: [],
      parentSessionId: 'parent-1',
    }];
    renderShell();

    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tc-1' } }));
    });

    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-utility-tab-subagents')).toBeDefined();
    expect(screen.getByTestId('workbench-subagent-panel')).toBeDefined();
  });
});
