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

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';

let mockDockVisible = false;
let mockArtifactOpen = false;
let mockArtifactKey: string | null = null;
const mockSetArtifactOpen = vi.fn();
const mockSetUtilityOpen = vi.fn();

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({ pendingCount: 0, requests: [] }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null }),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

vi.mock('./useChatWorkbenchLayout', () => ({
  useChatWorkbenchLayout: () => ({
    railOpen: true,
    artifactOpen: mockArtifactOpen,
    utilityOpen: false,
    terminalOpen: false,
    activeUtilityTab: 'activity',
    toggleRail: vi.fn(),
    setRailOpen: vi.fn(),
    toggleArtifact: vi.fn(),
    setArtifactOpen: mockSetArtifactOpen,
    toggleUtility: vi.fn(),
    setUtilityOpen: mockSetUtilityOpen,
    toggleTerminal: vi.fn(),
    setActiveUtilityTab: vi.fn(),
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
  ChatWorkbenchArtifactPane: () => <div data-testid="chat-workbench-artifact-pane" />,
}));

vi.mock('./ChatWorkbenchUtilityDrawer', () => ({
  ChatWorkbenchUtilityDrawer: () => <div data-testid="chat-workbench-utility-drawer" />,
}));

vi.mock('./useWorkbenchArtifacts', () => ({
  useWorkbenchArtifacts: () => ({
    kind: mockArtifactKey ? 'file' : 'empty',
    activeKey: mockArtifactKey,
    title: 'Artifacts',
    subtitle: null,
    hasArtifact: Boolean(mockArtifactKey),
  }),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockDockVisible = false;
  mockArtifactOpen = false;
  mockArtifactKey = null;
  mockSetArtifactOpen.mockReset();
  mockSetUtilityOpen.mockReset();
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
    mockArtifactKey = 'file:/tmp/example.ts';
    renderShell();
    expect(mockSetArtifactOpen).toHaveBeenCalledWith(true);
  });
});
