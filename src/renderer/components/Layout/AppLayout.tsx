import React, { useCallback, useEffect, useState } from 'react';

import type { FocusPanel } from '../../contexts/FocusContext';
import { useFocusPanel } from '../../contexts/FocusContext';
import {
  FOCUS_AGENT_CHAT_EVENT,
  FOCUS_TERMINAL_SESSION_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
  OPEN_CHAT_IN_TERMINAL_EVENT,
} from '../../hooks/appEventNames';
import type { WorkspaceLayout } from '../../types/electron';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import type { SidebarView } from './ActivityBar';
import { ActivityBar } from './ActivityBar';
import { AgentMonitorPane, CollapsedAgentStrip } from './AgentMonitorPane';
import { CentrePane } from './CentrePane';
import { ResizeDivider } from './ResizeDivider';
import { Sidebar } from './Sidebar';
import type { StatusBarLayoutProps,StatusBarProps } from './StatusBar';
import { StatusBar } from './StatusBar';
import { TerminalPane } from './TerminalPane';
import { TitleBar } from './TitleBar';
import { type CollapseTarget,usePanelCollapse } from './usePanelCollapse';
import { useResizable } from './useResizable';

export interface AppLayoutSlots {
  sidebarHeader?: React.ReactNode;
  sidebarContent?: React.ReactNode;
  /** Map of sidebar view id to its content. When provided, the activity bar
   *  switches between these views. The 'files' view defaults to sidebarContent. */
  sidebarViewContent?: Partial<Record<SidebarView, React.ReactNode>>;
  /** Map of sidebar view id to its header. The 'files' view defaults to sidebarHeader. */
  sidebarViewHeaders?: Partial<Record<SidebarView, React.ReactNode>>;
  editorTabBar?: React.ReactNode;
  editorContent?: React.ReactNode;
  agentCards?: React.ReactNode;
  terminalContent?: React.ReactNode;
}

export interface TerminalPaneControl {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onNewClaude: (providerModel?: string) => void;
  onNewCodex: (model?: string) => void;
  onReorder?: (reordered: TerminalSession[]) => void;
  /** Activate a session by ID, creating a terminal tab for it if it doesn't exist in the sessions list. */
  focusOrCreate?: (id: string) => void;
  /** Spawn an interactive Claude session (e.g. --resume <sessionId>) */
  onSpawnClaude?: (cwd?: string, options?: { resumeMode?: string; label?: string }) => Promise<void>;
  /** Spawn an interactive Codex session (e.g. `codex resume <threadId>`) */
  onSpawnCodex?: (cwd?: string, options?: { resumeThreadId?: string; label?: string; model?: string }) => Promise<void>;
}

export interface AppLayoutProps extends AppLayoutSlots {
  terminalControl: TerminalPaneControl;
  runningAgentCount?: number;
  statusBar?: StatusBarProps;
  keybindings?: Record<string, string>;
  layoutProps?: StatusBarLayoutProps;
  onApplyLayout?: (layout: WorkspaceLayout) => void;
}

interface PanelCollapseState {
  leftSidebar: boolean;
  rightSidebar: boolean;
  terminal: boolean;
}

function useApplyLayoutEvent(
  applySizes: (sizes: WorkspaceLayout['panelSizes']) => void,
  applyState: (state: PanelCollapseState) => void,
): void {
  useEffect(() => {
    function onApply(event: Event): void {
      const layout = (event as CustomEvent<WorkspaceLayout>).detail;
      if (!layout) return;
      applySizes(layout.panelSizes);
      applyState({
        leftSidebar: !layout.visiblePanels.leftSidebar,
        rightSidebar: !layout.visiblePanels.rightSidebar,
        terminal: !layout.visiblePanels.terminal,
      });
    }

    window.addEventListener('agent-ide:apply-layout', onApply);
    return () => window.removeEventListener('agent-ide:apply-layout', onApply);
  }, [applySizes, applyState]);
}

function usePanelEventHandlers(args: {
  expand: (panel: CollapseTarget) => void;
  setFocusedPanel: (panel: FocusPanel) => void;
  toggle: (panel: CollapseTarget) => void;
  activateTerminalSession?: (id: string) => void;
  focusOrCreate?: (id: string) => void;
  spawnClaudeSession?: (cwd?: string, options?: { resumeMode?: string; label?: string }) => Promise<void>;
  spawnCodexSession?: (cwd?: string, options?: { resumeThreadId?: string; label?: string; model?: string }) => Promise<void>;
}): void {
  const { expand, setFocusedPanel, toggle, activateTerminalSession } = args;

  useEffect(() => {
    function onToggleSidebar(): void {
      toggle('leftSidebar');
    }

    function onToggleAgentArea(): void {
      toggle('rightSidebar');
    }

    function onToggleTerminal(): void {
      toggle('terminal');
    }

    function onOpenAgentChat(): void {
      expand('rightSidebar');
      setFocusedPanel('agentMonitor');
    }

    function onFocusTerminalSession(event: Event): void {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (!detail?.sessionId) return;
      expand('terminal');
      setFocusedPanel('terminal');
      if (args.focusOrCreate) {
        args.focusOrCreate(detail.sessionId);
      } else {
        activateTerminalSession?.(detail.sessionId);
      }
    }

    function onOpenChatInTerminal(event: Event): void {
      const detail = (event as CustomEvent<{
        provider?: 'claude-code' | 'codex';
        sessionId?: string;
        claudeSessionId?: string;
        codexThreadId?: string;
        model?: string;
      }>).detail;
      const provider = detail?.provider ?? (detail?.codexThreadId ? 'codex' : 'claude-code');
      const sessionId = detail?.sessionId ?? detail?.claudeSessionId ?? detail?.codexThreadId;
      if (!sessionId) return;
      expand('terminal');
      setFocusedPanel('terminal');
      if (provider === 'codex') {
        if (!args.spawnCodexSession) return;
        void args.spawnCodexSession(undefined, {
          resumeThreadId: sessionId,
          label: 'Chat (resumed)',
          model: detail?.model,
        });
        return;
      }
      if (!args.spawnClaudeSession) return;
      void args.spawnClaudeSession(undefined, {
        resumeMode: sessionId,
        label: 'Chat (resumed)',
      });
    }

    window.addEventListener('agent-ide:toggle-sidebar', onToggleSidebar);
    window.addEventListener('agent-ide:toggle-agent-monitor', onToggleAgentArea);
    window.addEventListener('agent-ide:toggle-terminal', onToggleTerminal);
    window.addEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, onOpenAgentChat);
    window.addEventListener(FOCUS_AGENT_CHAT_EVENT, onOpenAgentChat);
    window.addEventListener(FOCUS_TERMINAL_SESSION_EVENT, onFocusTerminalSession);
    window.addEventListener(OPEN_CHAT_IN_TERMINAL_EVENT, onOpenChatInTerminal);

    return () => {
      window.removeEventListener('agent-ide:toggle-sidebar', onToggleSidebar);
      window.removeEventListener('agent-ide:toggle-agent-monitor', onToggleAgentArea);
      window.removeEventListener('agent-ide:toggle-terminal', onToggleTerminal);
      window.removeEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, onOpenAgentChat);
      window.removeEventListener(FOCUS_AGENT_CHAT_EVENT, onOpenAgentChat);
      window.removeEventListener(FOCUS_TERMINAL_SESSION_EVENT, onFocusTerminalSession);
      window.removeEventListener(OPEN_CHAT_IN_TERMINAL_EVENT, onOpenChatInTerminal);
    };
  }, [expand, setFocusedPanel, toggle, activateTerminalSession, args.focusOrCreate, args.spawnClaudeSession, args.spawnCodexSession]);
}

export type MobilePanel = 'chat' | 'editor' | 'terminal' | 'files';

/* ── Mobile bottom navigation bar ────────────────────────────────────────── */

const MOBILE_NAV_ITEMS: { id: MobilePanel; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'chat', label: 'Chat' },
];

function MobileNavIcon({ id }: { id: MobilePanel }): React.ReactElement {
  if (id === 'files') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="5" y="2" width="10" height="13" rx="1.5" />
        <rect x="3" y="5" width="10" height="13" rx="1.5" fill="var(--bg-secondary)" />
      </svg>
    );
  }
  if (id === 'editor') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <polyline points="7,5 3,10 7,15" /><polyline points="13,5 17,10 13,15" /><line x1="11" y1="3" x2="9" y2="17" />
      </svg>
    );
  }
  if (id === 'terminal') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="2" />
        <polyline points="6,8 9,11 6,14" />
        <line x1="11" y1="14" x2="15" y2="14" />
      </svg>
    );
  }
  // chat
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  );
}

function MobileNavBar({ active, onSwitch }: { active: MobilePanel; onSwitch: (p: MobilePanel) => void }): React.ReactElement {
  return (
    <nav
      data-layout="mobile-nav"
      className="web-mobile-only"
      style={{
        display: 'none', // shown by CSS on mobile web
        flexShrink: 0,
        minHeight: '56px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => onSwitch(item.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: '2px',
              background: 'none',
              border: 'none',
              borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '10px',
              fontFamily: 'var(--font-ui, sans-serif)',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 100ms ease, border-color 100ms ease',
              paddingTop: '4px',
            }}
          >
            <MobileNavIcon id={item.id} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppLayout(props: AppLayoutProps): React.ReactElement {
  const { sizes, startResize, resetSize, applySizes } = useResizable();
  const { collapsed, toggle, expand, collapse, applyState } = usePanelCollapse({ keybindings: props.keybindings });
  const { focusedPanel, setFocusedPanel } = useFocusPanel();
  const [sidebarView, setSidebarView] = useState<SidebarView>('files');
  const [mobileActivePanel, setMobileActivePanel] = useState<MobilePanel>('chat');
  useApplyLayoutEvent(applySizes, applyState);
  usePanelEventHandlers({
    expand,
    setFocusedPanel,
    toggle,
    activateTerminalSession: props.terminalControl.onActivate,
    focusOrCreate: props.terminalControl.focusOrCreate,
    spawnClaudeSession: props.terminalControl.onSpawnClaude,
    spawnCodexSession: props.terminalControl.onSpawnCodex,
  });

  const handleMobilePanelSwitch = useCallback((panel: MobilePanel) => {
    setMobileActivePanel(panel);
    if (panel === 'files') {
      expand('leftSidebar');
      collapse('rightSidebar');
    } else if (panel === 'chat') {
      collapse('leftSidebar');
      expand('rightSidebar');
    } else if (panel === 'terminal') {
      collapse('leftSidebar');
      collapse('rightSidebar');
      expand('terminal');
    } else {
      // editor — collapse both sidebars, collapse terminal so editor gets full space
      collapse('leftSidebar');
      collapse('rightSidebar');
      collapse('terminal');
    }
  }, [expand, collapse]);

  const handleActivityViewChange = useCallback((view: SidebarView) => {
    setSidebarView(view);
    // Ensure sidebar is visible when switching views
    if (collapsed.leftSidebar) {
      expand('leftSidebar');
    }
  }, [collapsed.leftSidebar, expand]);

  const handleActivityToggle = useCallback(() => {
    toggle('leftSidebar');
  }, [toggle]);

  // Resolve which content/header to show based on active sidebar view
  const activeSidebarContent = sidebarView === 'files'
    ? props.sidebarContent
    : props.sidebarViewContent?.[sidebarView] ?? null;

  const activeSidebarHeader = sidebarView === 'files'
    ? props.sidebarHeader
    : props.sidebarViewHeaders?.[sidebarView] ?? null;

  const pfs = useCallback(
    (panel: FocusPanel): React.CSSProperties =>
      focusedPanel === panel ? { outline: '1px solid var(--accent)', outlineOffset: '-1px' } : {},
    [focusedPanel],
  );

  const mkResize = useCallback(
    (panel: 'leftSidebar' | 'rightSidebar' | 'terminal', axis: 'vertical' | 'horizontal') =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const pos = axis === 'vertical' ? e.clientX : e.clientY;
        startResize(panel, axis, sizes[panel], pos);
      },
    [sizes, startResize],
  );

  const { terminalControl: tc, layoutProps } = props;
  const runningAgentCount = props.runningAgentCount ?? 0;

  return (
    <div data-layout="app" data-mobile-active={mobileActivePanel} className="relative flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)] p-3 sm:p-4" style={{ fontFamily: 'var(--font-ui, var(--font-mono, monospace))', backgroundImage: 'var(--bg-gradient, none)' }}>
      <div data-layout="app-shell" className="glass-shell flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden p-3 sm:p-4">
        <TitleBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Activity bar — always visible (hidden on mobile via CSS) */}
          <ActivityBar
            activeView={sidebarView}
            sidebarCollapsed={collapsed.leftSidebar}
            onViewChange={handleActivityViewChange}
            onToggleSidebar={handleActivityToggle}
          />

          {/* Left sidebar — collapses but activity bar stays */}
          {!collapsed.leftSidebar && (
            <>
              <Sidebar
                width={sizes.leftSidebar}
                collapsed={false}
                onToggleCollapse={() => toggle('leftSidebar')}
                header={activeSidebarHeader}
                focusStyle={pfs('sidebar')}
                onFocus={() => setFocusedPanel('sidebar')}
              >
                {activeSidebarContent}
              </Sidebar>
              <ResizeDivider direction="vertical" onPointerDown={mkResize('leftSidebar', 'vertical')} onDoubleClick={() => resetSize('leftSidebar')} label="Resize left sidebar" />
            </>
          )}

          {/* Centre column: editor + terminal stacked vertically */}
          <div data-layout="centre-column" className="flex flex-col flex-1 min-w-0 min-h-0">
            <CentrePane tabBar={props.editorTabBar} focusStyle={pfs('editor')} onFocus={() => setFocusedPanel('editor')}>
              {props.editorContent}
            </CentrePane>
            <ResizeDivider direction="horizontal" onPointerDown={mkResize('terminal', 'horizontal')} onDoubleClick={() => resetSize('terminal')} label="Resize terminal" />
            <TerminalPane height={sizes.terminal} collapsed={collapsed.terminal} onToggleCollapse={() => toggle('terminal')} sessions={tc.sessions} activeSessionId={tc.activeSessionId} onActivate={tc.onActivate} onClose={tc.onClose} onNew={tc.onNew} onNewClaude={tc.onNewClaude} onNewCodex={tc.onNewCodex} onReorder={tc.onReorder} focusStyle={pfs('terminal')} onFocus={() => setFocusedPanel('terminal')}>
              {props.terminalContent}
            </TerminalPane>
          </div>

          {/* Right sidebar divider + agent pane */}
          {!collapsed.rightSidebar && <ResizeDivider direction="vertical" onPointerDown={mkResize('rightSidebar', 'vertical')} onDoubleClick={() => resetSize('rightSidebar')} label="Resize right sidebar" />}
          {collapsed.rightSidebar && (
            <CollapsedAgentStrip onExpand={() => toggle('rightSidebar')} runningCount={runningAgentCount} />
          )}
          {/* Always keep workspace mounted — display:none preserves streaming state and model overrides across sidebar collapse */}
          <div style={{ display: collapsed.rightSidebar ? 'none' : undefined }}>
            <AgentMonitorPane width={sizes.rightSidebar} collapsed={false} onToggleCollapse={() => toggle('rightSidebar')} focusStyle={pfs('agentMonitor')} onFocus={() => setFocusedPanel('agentMonitor')}>
              {props.agentCards}
            </AgentMonitorPane>
          </div>
        </div>
        {/* Mobile bottom nav — hidden on desktop via CSS */}
        <MobileNavBar active={mobileActivePanel} onSwitch={handleMobilePanelSwitch} />
        <div data-layout="status-bar">
          <StatusBar {...props.statusBar} layout={layoutProps ? { ...layoutProps, currentPanelSizes: sizes, currentVisiblePanels: { leftSidebar: !collapsed.leftSidebar, rightSidebar: !collapsed.rightSidebar, terminal: !collapsed.terminal } } : undefined} />
        </div>
      </div>
    </div>
  );
}
