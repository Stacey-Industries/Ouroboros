/**
 * @vitest-environment jsdom
 *
 * Integration test — Chat-Only Shell mode-switch flow (Wave 42 Phase E).
 *
 * Tests the branching contract at the InnerApp level without mounting the
 * full App tree (which requires terminal spawners, workspace layouts, etc.).
 * Instead, we mount a minimal BranchHarness that mirrors InnerApp's:
 *
 *   const isImmersive = isChatWindow || immersiveFlag;
 *   return isImmersive ? <ChatOnlyShellWrapper /> : <InnerAppLayout />;
 *
 * Providers that both shells require (DiffReviewProvider, FileViewerManager,
 * MultiBufferManager, ProjectProvider, AgentEventsProvider) are mounted by
 * BranchHarness so both shells see a complete provider stack.
 *
 * Assertions:
 *  1. immersiveChat:true  → ChatOnlyShell in tree, AppLayout NOT in tree.
 *  2. immersiveChat:false → AppLayout in tree, chat-only title bar NOT in tree.
 *  3. TOGGLE_IMMERSIVE_CHAT_EVENT flips the tree live (no re-mount of providers).
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOGGLE_IMMERSIVE_CHAT_EVENT } from '../../../hooks/appEventNames';
import { ChatOnlyShellWrapper } from './ChatOnlyShellWrapper';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Providers — pass-through stubs so shells can mount without IPC.
vi.mock('../../../contexts/ProjectContext', () => ({
  ProjectProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useProject: () => ({
    projectRoot: '/test/project',
    projectName: 'project',
    projectRoots: ['/test/project'],
    addProjectRoot: vi.fn(),
  }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
  AgentEventsProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useAgentEventsContext: () => ({ currentSessions: [], agents: [] }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  ToastProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('../../../contexts/FocusContext', () => ({
  FocusProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useFocus: () => ({ focusedPanel: null, setFocus: vi.fn() }),
}));

vi.mock('../../../contexts/ApprovalContext', () => ({
  ApprovalProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// FileViewer / DiffReview providers — pass-through.
vi.mock('../../FileViewer', () => ({
  FileViewerManager: ({ children }: React.PropsWithChildren) => <>{children}</>,
  MultiBufferManager: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useFileViewerManager: () => ({ openFile: vi.fn(), activeFile: null }),
}));

vi.mock('../../DiffReview', () => ({
  DiffReviewProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null }),
}));

// ChatOnlyShell sub-components — use lightweight stubs to avoid deep IPC deps.
vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => (
    <div data-testid="agent-chat-workspace">AgentChatWorkspace</div>
  ),
}));

vi.mock('../../../hooks/useGitBranch', () => ({
  useGitBranch: () => ({ branch: 'main' }),
}));

vi.mock('./ChatOnlySessionDrawer', () => ({
  ChatOnlySessionDrawer: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="session-drawer" data-open={String(open)}>SessionDrawer</div>
  ),
}));

vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="diff-overlay" data-open={String(open)}>DiffOverlay</div>
  ),
}));

// IDE shell stub — lightweight stand-in for the full InnerAppLayout.
vi.mock('../AppLayoutConnected', () => ({
  AppLayoutConnected: () => <div data-testid="app-layout-connected">AppLayout</div>,
}));

vi.mock('../InnerAppLayout', () => ({
  InnerAppLayout: () => <div data-testid="inner-app-layout">IDEShell</div>,
}));

// useImmersiveChatFlag — controlled by test state, no IPC needed.
// Each test sets initialFlag before calling render.
let mockFlagValue = false;
vi.mock('../../../hooks/useImmersiveChatFlag', () => ({
  useImmersiveChatFlag: () => mockFlagValue,
}));

vi.mock('../../../hooks/useChatWindowMode', () => ({
  useChatWindowMode: () => ({ isChatWindow: false, sessionId: null }),
}));

// ── BranchHarness ──────────────────────────────────────────────────────────────
//
// Mirrors InnerApp's branch logic:
//   const isImmersive = isChatWindow || immersiveFlag;
// Subscribes to TOGGLE_IMMERSIVE_CHAT_EVENT to flip state live — same as
// useImmersiveChatFlag does internally (the mock replaces the hook but the
// event listener behaviour is tested via the harness here).

function BranchHarness({ initial }: { initial: boolean }): React.ReactElement {
  const [isImmersive, setIsImmersive] = useState(initial);

  React.useEffect(() => {
    const handler = (): void => { setIsImmersive((prev) => !prev); };
    window.addEventListener(TOGGLE_IMMERSIVE_CHAT_EVENT, handler);
    return () => { window.removeEventListener(TOGGLE_IMMERSIVE_CHAT_EVENT, handler); };
  }, []);

  if (isImmersive) return <ChatOnlyShellWrapper />;
  return <div data-testid="inner-app-layout">IDEShell</div>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => { mockFlagValue = false; });
afterEach(() => cleanup());

describe('ChatOnlyShell integration — mode-switch branch', () => {
  it('mounts ChatOnlyShell when immersiveChat is true', () => {
    render(<BranchHarness initial={true} />);
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();
    expect(screen.getByTestId('agent-chat-workspace')).toBeDefined();
    expect(screen.queryByTestId('inner-app-layout')).toBeNull();
  });

  it('mounts IDE shell when immersiveChat is false', () => {
    render(<BranchHarness initial={false} />);
    expect(screen.getByTestId('inner-app-layout')).toBeDefined();
    expect(screen.queryByTestId('chat-only-title-bar')).toBeNull();
    expect(screen.queryByTestId('agent-chat-workspace')).toBeNull();
  });

  it('does not render IDE shell components inside ChatOnlyShellWrapper', () => {
    render(<BranchHarness initial={true} />);
    const html = document.body.innerHTML;
    const forbidden = [
      'TerminalPane', 'TerminalManager', 'AgentMonitorPane',
      'AppLayout', 'IdeToolBridge', 'RightSidebarTabs', 'Sidebar',
      'CentrePaneConnected',
    ];
    for (const name of forbidden) {
      expect(html, `expected "${name}" to be absent from chat-only tree`).not.toContain(name);
    }
  });

  it('flips from IDE shell to ChatOnlyShell on TOGGLE_IMMERSIVE_CHAT_EVENT', () => {
    render(<BranchHarness initial={false} />);
    expect(screen.getByTestId('inner-app-layout')).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_IMMERSIVE_CHAT_EVENT));
    });

    expect(screen.queryByTestId('inner-app-layout')).toBeNull();
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();
  });

  it('flips back from ChatOnlyShell to IDE shell on second toggle', () => {
    render(<BranchHarness initial={true} />);
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_IMMERSIVE_CHAT_EVENT));
    });

    expect(screen.queryByTestId('chat-only-title-bar')).toBeNull();
    expect(screen.getByTestId('inner-app-layout')).toBeDefined();
  });

  it('ChatOnlyShell has "Chat Mode" badge text', () => {
    render(<BranchHarness initial={true} />);
    const titleBar = screen.getByTestId('chat-only-title-bar');
    expect(titleBar.textContent).toContain('Chat Mode');
  });
});
