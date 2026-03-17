import React, { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { CentrePane } from './CentrePane';
import { AgentMonitorPane, CollapsedAgentStrip } from './AgentMonitorPane';
import { TerminalPane } from './TerminalPane';
import { TitleBar } from './TitleBar';
import { ResizeDivider } from './ResizeDivider';
import { useResizable } from './useResizable';
import { usePanelCollapse, type CollapseTarget } from './usePanelCollapse';
import { StatusBar } from './StatusBar';
import type { StatusBarProps, StatusBarLayoutProps } from './StatusBar';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import { useFocusPanel } from '../../contexts/FocusContext';
import type { FocusPanel } from '../../contexts/FocusContext';
import type { WorkspaceLayout } from '../../types/electron';
import {
  FOCUS_AGENT_CHAT_EVENT,
  FOCUS_TERMINAL_SESSION_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
  OPEN_CHAT_IN_TERMINAL_EVENT,
} from '../../hooks/appEventNames';
import { ActivityBar } from './ActivityBar';
import type { SidebarView } from './ActivityBar';

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
  onNewClaude: () => void;
  onReorder?: (reordered: TerminalSession[]) => void;
  /** Activate a session by ID, creating a terminal tab for it if it doesn't exist in the sessions list. */
  focusOrCreate?: (id: string) => void;
  /** Spawn an interactive Claude session (e.g. --resume <sessionId>) */
  onSpawnClaude?: (cwd?: string, options?: { resumeMode?: string; label?: string }) => Promise<void>;
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
      const detail = (event as CustomEvent<{ claudeSessionId: string }>).detail;
      if (!detail?.claudeSessionId || !args.spawnClaudeSession) return;
      expand('terminal');
      setFocusedPanel('terminal');
      void args.spawnClaudeSession(undefined, {
        resumeMode: detail.claudeSessionId,
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
  }, [expand, setFocusedPanel, toggle, activateTerminalSession, args.focusOrCreate, args.spawnClaudeSession]);
}

export function AppLayout(props: AppLayoutProps): React.ReactElement {
  const { sizes, startResize, resetSize, applySizes } = useResizable();
  const { collapsed, toggle, expand, applyState } = usePanelCollapse({ keybindings: props.keybindings });
  const { focusedPanel, setFocusedPanel } = useFocusPanel();
  const [sidebarView, setSidebarView] = useState<SidebarView>('files');
  useApplyLayoutEvent(applySizes, applyState);
  usePanelEventHandlers({ expand, setFocusedPanel, toggle, activateTerminalSession: props.terminalControl.onActivate, focusOrCreate: props.terminalControl.focusOrCreate, spawnClaudeSession: props.terminalControl.onSpawnClaude });

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
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]" style={{ fontFamily: 'var(--font-ui, var(--font-mono, monospace))', backgroundImage: 'var(--bg-gradient, none)' }}>
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity bar — always visible */}
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
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <CentrePane tabBar={props.editorTabBar} focusStyle={pfs('editor')} onFocus={() => setFocusedPanel('editor')}>
            {props.editorContent}
          </CentrePane>
          <ResizeDivider direction="horizontal" onPointerDown={mkResize('terminal', 'horizontal')} onDoubleClick={() => resetSize('terminal')} label="Resize terminal" />
          <TerminalPane height={sizes.terminal} collapsed={collapsed.terminal} onToggleCollapse={() => toggle('terminal')} sessions={tc.sessions} activeSessionId={tc.activeSessionId} onActivate={tc.onActivate} onClose={tc.onClose} onNew={tc.onNew} onNewClaude={tc.onNewClaude} onReorder={tc.onReorder} focusStyle={pfs('terminal')} onFocus={() => setFocusedPanel('terminal')}>
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
      <StatusBar {...props.statusBar} layout={layoutProps ? { ...layoutProps, currentPanelSizes: sizes, currentVisiblePanels: { leftSidebar: !collapsed.leftSidebar, rightSidebar: !collapsed.rightSidebar, terminal: !collapsed.terminal } } : undefined} />
    </div>
  );
}
