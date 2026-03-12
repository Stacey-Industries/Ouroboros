import React, { useCallback, useEffect } from 'react';
import { Sidebar, CollapsedSidebarStrip } from './Sidebar';
import { CentrePane } from './CentrePane';
import { AgentMonitorPane, CollapsedAgentStrip } from './AgentMonitorPane';
import { TerminalPane } from './TerminalPane';
import { useResizable } from './useResizable';
import { usePanelCollapse } from './usePanelCollapse';
import { StatusBar } from './StatusBar';
import type { StatusBarProps, StatusBarLayoutProps } from './StatusBar';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import { useFocusPanel } from '../../contexts/FocusContext';
import type { FocusPanel } from '../../contexts/FocusContext';
import type { WorkspaceLayout, PanelSizes } from '../../types/electron';

// ------------------------------------------------------------------
// Named slot props — callers compose children into these buckets
// ------------------------------------------------------------------

export interface AppLayoutSlots {
  /** Content for the sidebar header (project picker, etc.) */
  sidebarHeader?: React.ReactNode;
  /** File tree / navigation content */
  sidebarContent?: React.ReactNode;
  /** Tab bar for open files in the editor */
  editorTabBar?: React.ReactNode;
  /** Main editor / viewer content */
  editorContent?: React.ReactNode;
  /** Agent card list */
  agentCards?: React.ReactNode;
  /** Terminal sessions */
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
}

export interface AppLayoutProps extends AppLayoutSlots {
  /** Terminal tab control passed through to TerminalPane */
  terminalControl: TerminalPaneControl;
  /** Running agent count used for the collapsed strip badge */
  runningAgentCount?: number;
  /** Props forwarded to the bottom status bar */
  statusBar?: StatusBarProps;
  /** User-configured keybindings passed through to usePanelCollapse */
  keybindings?: Record<string, string>;
  /** Layout props for workspace layout switching */
  layoutProps?: StatusBarLayoutProps;
  /** Callback to apply a layout (sets sizes + collapse state) */
  onApplyLayout?: (layout: WorkspaceLayout) => void;
}

/**
 * AppLayout — three-column layout with resizable panels and a bottom terminal.
 *
 * Layout (simplified):
 *
 * ┌─────────────┬───────────────────────┬──────────────────┐
 * │  Left       │                       │   Right          │
 * │  Sidebar    │    Centre Pane        │   Agent Monitor  │
 * │  (220px)    │    (flex)             │   (300px)        │
 * ├─────────────┴───────────────────────┴──────────────────┤
 * │             Terminal Pane (280px)                       │
 * └─────────────────────────────────────────────────────────┘
 *
 * All panels are independently collapsible and resizable.
 */
export function AppLayout({
  sidebarHeader,
  sidebarContent,
  editorTabBar,
  editorContent,
  agentCards,
  terminalContent,
  terminalControl,
  runningAgentCount = 0,
  statusBar,
  keybindings,
  layoutProps,
}: AppLayoutProps): React.ReactElement {
  const { sizes, startResize, resetSize, applySizes } = useResizable();
  const { collapsed, toggle, applyState: applyCollapseState } = usePanelCollapse({ keybindings });
  const { focusedPanel, setFocusedPanel } = useFocusPanel();

  // Listen for layout-apply events from the workspace layout system
  useEffect(() => {
    function onApplyLayout(e: Event): void {
      const layout = (e as CustomEvent<WorkspaceLayout>).detail;
      if (!layout) return;
      applySizes(layout.panelSizes);
      applyCollapseState({
        leftSidebar: !layout.visiblePanels.leftSidebar,
        rightSidebar: !layout.visiblePanels.rightSidebar,
        terminal: !layout.visiblePanels.terminal,
      });
    }
    window.addEventListener('agent-ide:apply-layout', onApplyLayout);
    return () => window.removeEventListener('agent-ide:apply-layout', onApplyLayout);
  }, [applySizes, applyCollapseState]);

  // Helper: generates a thin inset ring on the focused panel
  function panelFocusStyle(panel: FocusPanel): React.CSSProperties {
    return focusedPanel === panel
      ? { boxShadow: 'inset 0 0 0 1px var(--accent)' }
      : {};
  }

  const handleLeftResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startResize('leftSidebar', 'vertical', sizes.leftSidebar, e.clientX);
    },
    [sizes.leftSidebar, startResize],
  );

  const handleRightResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startResize('rightSidebar', 'vertical', sizes.rightSidebar, e.clientX);
    },
    [sizes.rightSidebar, startResize],
  );

  const handleTerminalResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startResize('terminal', 'horizontal', sizes.terminal, e.clientY);
    },
    [sizes.terminal, startResize],
  );

  return (
    <div
      className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]"
      style={{
        fontFamily: 'var(--font-ui, var(--font-mono, monospace))',
        backgroundImage: 'var(--bg-gradient, none)',
      }}
    >
      {/* ── TITLEBAR (drag region) ── */}
      <div
        className="titlebar-drag flex-shrink-0 flex items-center"
        style={{
          height: 'var(--titlebar-height, 32px)',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Settings gear — no-drag so it's clickable */}
        <button
          className="titlebar-no-drag"
          title="Settings (Ctrl+,)"
          onClick={() => window.dispatchEvent(new CustomEvent('agent-ide:open-settings'))}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'color 150ms, background-color 150ms',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text)';
            e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M11.99 11.99l1.07 1.07M13.07 2.93l-1.06 1.06M4.01 11.99l-1.07 1.07" />
          </svg>
        </button>
        <span
          className="select-none"
          style={{
            color: 'var(--text-muted)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 500,
          }}
        >
          Ouroboros
        </span>
        {/* Reserve space for native Windows overlay controls on the right */}
        <div className="flex-1" />
        <div style={{ width: 140 }} />
      </div>

      {/*
       * Main area: three-column row, fills all space above the terminal.
       * We use a flex row. The centre pane has flex:1 to absorb remaining width.
       */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        {collapsed.leftSidebar ? (
          <CollapsedSidebarStrip onExpand={() => toggle('leftSidebar')} />
        ) : (
          <Sidebar
            width={sizes.leftSidebar}
            collapsed={false}
            onToggleCollapse={() => toggle('leftSidebar')}
            header={sidebarHeader}
            focusStyle={panelFocusStyle('sidebar')}
            onFocus={() => setFocusedPanel('sidebar')}
          >
            {sidebarContent}
          </Sidebar>
        )}

        {/* Resize handle between left sidebar and centre */}
        {!collapsed.leftSidebar && (
          <div
            className="group relative flex-shrink-0 w-[5px] cursor-col-resize select-none z-10"
            onMouseDown={handleLeftResizeStart}
            onDoubleClick={() => resetSize('leftSidebar')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left sidebar"
            style={{ touchAction: 'none' }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
            <div className="absolute inset-y-0 left-[2px] w-[1px] bg-[var(--border)] transition-colors duration-100 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]" />
          </div>
        )}

        {/* ── CENTRE PANE ── */}
        <CentrePane
          tabBar={editorTabBar}
          focusStyle={panelFocusStyle('editor')}
          onFocus={() => setFocusedPanel('editor')}
        >
          {editorContent}
        </CentrePane>

        {/* Resize handle between centre and right sidebar */}
        {!collapsed.rightSidebar && (
          <div
            className="group relative flex-shrink-0 w-[5px] cursor-col-resize select-none z-10"
            onMouseDown={handleRightResizeStart}
            onDoubleClick={() => resetSize('rightSidebar')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right sidebar"
            style={{ touchAction: 'none' }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
            <div className="absolute inset-y-0 left-[2px] w-[1px] bg-[var(--border)] transition-colors duration-100 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]" />
          </div>
        )}

        {/* ── RIGHT SIDEBAR (Agent Monitor) ── */}
        {collapsed.rightSidebar ? (
          <CollapsedAgentStrip
            onExpand={() => toggle('rightSidebar')}
            runningCount={runningAgentCount}
          />
        ) : (
          <AgentMonitorPane
            width={sizes.rightSidebar}
            collapsed={false}
            onToggleCollapse={() => toggle('rightSidebar')}
            focusStyle={panelFocusStyle('agentMonitor')}
            onFocus={() => setFocusedPanel('agentMonitor')}
          >
            {agentCards}
          </AgentMonitorPane>
        )}
      </div>

      {/* ── TERMINAL RESIZE HANDLE ── */}
      <div
        className="group relative flex-shrink-0 h-[5px] cursor-row-resize select-none z-10 w-full"
        onMouseDown={handleTerminalResizeStart}
        onDoubleClick={() => resetSize('terminal')}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        style={{ touchAction: 'none' }}
      >
        <div className="absolute inset-x-0 -top-1 -bottom-1" />
        <div className="absolute inset-x-0 top-[2px] h-[1px] bg-[var(--border)] transition-colors duration-100 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]" />
      </div>

      {/* ── TERMINAL PANE ── */}
      <TerminalPane
        height={sizes.terminal}
        collapsed={collapsed.terminal}
        onToggleCollapse={() => toggle('terminal')}
        sessions={terminalControl.sessions}
        activeSessionId={terminalControl.activeSessionId}
        onActivate={terminalControl.onActivate}
        onClose={terminalControl.onClose}
        onNew={terminalControl.onNew}
        onNewClaude={terminalControl.onNewClaude}
        onReorder={terminalControl.onReorder}
        focusStyle={panelFocusStyle('terminal')}
        onFocus={() => setFocusedPanel('terminal')}
      >
        {terminalContent}
      </TerminalPane>

      {/* ── STATUS BAR ── */}
      <StatusBar
        {...statusBar}
        layout={layoutProps ? {
          ...layoutProps,
          currentPanelSizes: sizes,
          currentVisiblePanels: {
            leftSidebar: !collapsed.leftSidebar,
            rightSidebar: !collapsed.rightSidebar,
            terminal: !collapsed.terminal,
          },
        } : undefined}
      />
    </div>
  );
}
