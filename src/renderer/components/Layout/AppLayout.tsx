import React, { useCallback, useEffect } from 'react';
import { Sidebar, CollapsedSidebarStrip } from './Sidebar';
import { CentrePane } from './CentrePane';
import { AgentMonitorPane, CollapsedAgentStrip } from './AgentMonitorPane';
import { TerminalPane } from './TerminalPane';
import { TitleBar } from './TitleBar';
import { ResizeDivider } from './ResizeDivider';
import { useResizable } from './useResizable';
import { usePanelCollapse } from './usePanelCollapse';
import { StatusBar } from './StatusBar';
import type { StatusBarProps, StatusBarLayoutProps } from './StatusBar';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import { useFocusPanel } from '../../contexts/FocusContext';
import type { FocusPanel } from '../../contexts/FocusContext';
import type { WorkspaceLayout } from '../../types/electron';

export interface AppLayoutSlots {
  sidebarHeader?: React.ReactNode;
  sidebarContent?: React.ReactNode;
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
}

export interface AppLayoutProps extends AppLayoutSlots {
  terminalControl: TerminalPaneControl;
  runningAgentCount?: number;
  statusBar?: StatusBarProps;
  keybindings?: Record<string, string>;
  layoutProps?: StatusBarLayoutProps;
  onApplyLayout?: (layout: WorkspaceLayout) => void;
}

export function AppLayout(props: AppLayoutProps): React.ReactElement {
  const { sizes, startResize, resetSize, applySizes } = useResizable();
  const { collapsed, toggle, applyState } = usePanelCollapse({ keybindings: props.keybindings });
  const { focusedPanel, setFocusedPanel } = useFocusPanel();

  useEffect(() => {
    function onApply(e: Event): void {
      const layout = (e as CustomEvent<WorkspaceLayout>).detail;
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

  const pfs = useCallback(
    (panel: FocusPanel): React.CSSProperties =>
      focusedPanel === panel ? { boxShadow: 'inset 0 0 0 1px var(--accent)' } : {},
    [focusedPanel],
  );

  const mkResize = useCallback(
    (panel: 'leftSidebar' | 'rightSidebar' | 'terminal', axis: 'vertical' | 'horizontal') =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        const pos = axis === 'vertical' ? e.clientX : e.clientY;
        startResize(panel, axis, sizes[panel], pos);
      },
    [sizes, startResize],
  );

  const { terminalControl: tc, layoutProps } = props;

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]" style={{ fontFamily: 'var(--font-ui, var(--font-mono, monospace))', backgroundImage: 'var(--bg-gradient, none)' }}>
      <TitleBar />
      <ColumnsRow {...props} sizes={sizes} collapsed={collapsed} toggle={toggle} pfs={pfs} setFocusedPanel={setFocusedPanel} mkResize={mkResize} resetSize={resetSize} />
      <ResizeDivider direction="horizontal" onMouseDown={mkResize('terminal', 'horizontal')} onDoubleClick={() => resetSize('terminal')} label="Resize terminal" />
      <TerminalPane height={sizes.terminal} collapsed={collapsed.terminal} onToggleCollapse={() => toggle('terminal')} sessions={tc.sessions} activeSessionId={tc.activeSessionId} onActivate={tc.onActivate} onClose={tc.onClose} onNew={tc.onNew} onNewClaude={tc.onNewClaude} onReorder={tc.onReorder} focusStyle={pfs('terminal')} onFocus={() => setFocusedPanel('terminal')}>
        {props.terminalContent}
      </TerminalPane>
      <StatusBar {...props.statusBar} layout={layoutProps ? { ...layoutProps, currentPanelSizes: sizes, currentVisiblePanels: { leftSidebar: !collapsed.leftSidebar, rightSidebar: !collapsed.rightSidebar, terminal: !collapsed.terminal } } : undefined} />
    </div>
  );
}

/* Columns row — extracted to keep AppLayout under 40 lines */
function ColumnsRow({ sidebarHeader, sidebarContent, editorTabBar, editorContent, agentCards, runningAgentCount = 0, sizes, collapsed, toggle, pfs, setFocusedPanel, mkResize, resetSize }: AppLayoutSlots & { runningAgentCount?: number; sizes: Record<string, number>; collapsed: Record<string, boolean>; toggle: (p: string) => void; pfs: (p: FocusPanel) => React.CSSProperties; setFocusedPanel: (p: FocusPanel) => void; mkResize: (panel: 'leftSidebar' | 'rightSidebar' | 'terminal', axis: 'vertical' | 'horizontal') => (e: React.MouseEvent) => void; resetSize: (p: string) => void }): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {collapsed.leftSidebar ? (
        <CollapsedSidebarStrip onExpand={() => toggle('leftSidebar')} />
      ) : (
        <Sidebar width={sizes.leftSidebar} collapsed={false} onToggleCollapse={() => toggle('leftSidebar')} header={sidebarHeader} focusStyle={pfs('sidebar')} onFocus={() => setFocusedPanel('sidebar')}>
          {sidebarContent}
        </Sidebar>
      )}
      {!collapsed.leftSidebar && <ResizeDivider direction="vertical" onMouseDown={mkResize('leftSidebar', 'vertical')} onDoubleClick={() => resetSize('leftSidebar')} label="Resize left sidebar" />}
      <CentrePane tabBar={editorTabBar} focusStyle={pfs('editor')} onFocus={() => setFocusedPanel('editor')}>
        {editorContent}
      </CentrePane>
      {!collapsed.rightSidebar && <ResizeDivider direction="vertical" onMouseDown={mkResize('rightSidebar', 'vertical')} onDoubleClick={() => resetSize('rightSidebar')} label="Resize right sidebar" />}
      {collapsed.rightSidebar ? (
        <CollapsedAgentStrip onExpand={() => toggle('rightSidebar')} runningCount={runningAgentCount} />
      ) : (
        <AgentMonitorPane width={sizes.rightSidebar} collapsed={false} onToggleCollapse={() => toggle('rightSidebar')} focusStyle={pfs('agentMonitor')} onFocus={() => setFocusedPanel('agentMonitor')}>
          {agentCards}
        </AgentMonitorPane>
      )}
    </div>
  );
}
