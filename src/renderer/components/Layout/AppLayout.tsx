import React, { useCallback, useEffect, useRef } from 'react';

import { useFocusPanel } from '../../contexts/FocusContext';
import { useMobileLayout } from '../../contexts/MobileLayoutContext';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import type { WorkspaceLayout } from '../../types/electron';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import { AgentMonitorPane } from './AgentMonitorPane';
import type { MobilePanel } from './AppLayout.mobile';
import { MOBILE_NAV_ITEMS, MobileNavBar } from './AppLayout.mobile';
import { usePanelEventHandlers } from './AppLayout.panelEvents';
import { CentrePane } from './CentrePane';
import { DroppableSlot } from './DroppableSlot';
import { ResizeDivider } from './ResizeDivider';
import { Sidebar } from './Sidebar';
import type { StatusBarLayoutProps, StatusBarProps } from './StatusBar';
import { StatusBar } from './StatusBar';
import { TerminalPane } from './TerminalPane';
import { TitleBar } from './TitleBar';
import { DragAndDropProvider, useDragAndDrop } from './useDragAndDrop';
import { useDropTargets } from './useDropTargets';
import { type CollapseTarget, usePanelCollapse } from './usePanelCollapse';
import { useResizable } from './useResizable';

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
  onNewClaude: (providerModel?: string) => void;
  onNewCodex: (model?: string) => void;
  onReorder?: (reordered: TerminalSession[]) => void;
  /** Activate a session by ID, creating a terminal tab for it if it doesn't exist in the sessions list. */
  focusOrCreate?: (id: string) => void;
  /** Spawn an interactive Claude session (e.g. --resume <sessionId>) */
  onSpawnClaude?: (
    cwd?: string,
    options?: { resumeMode?: string; label?: string },
  ) => Promise<void>;
  /** Spawn an interactive Codex session (e.g. `codex resume <threadId>`) */
  onSpawnCodex?: (
    cwd?: string,
    options?: { resumeThreadId?: string; label?: string; model?: string },
  ) => Promise<void>;
}

export interface AppLayoutProps extends AppLayoutSlots {
  terminalControl: TerminalPaneControl;
  runningAgentCount?: number;
  statusBar?: StatusBarProps;
  keybindings?: Record<string, string>;
  layoutProps?: StatusBarLayoutProps;
  onApplyLayout?: (layout: WorkspaceLayout) => void;
}

type PanelCollapseState = { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean; editor: boolean };
type MobilePanelActions = { expand: (panel: CollapseTarget) => void; collapse: (panel: CollapseTarget) => void; setActivePanel: (panel: MobilePanel) => void };

function useApplyLayoutEvent(
  applySizes: (sizes: WorkspaceLayout['panelSizes']) => void,
  applyState: (state: PanelCollapseState) => void,
): void {
  useEffect(() => {
    function onApply(event: Event): void {
      const layout = (event as CustomEvent<WorkspaceLayout>).detail;
      if (!layout) return;
      applySizes(layout.panelSizes);
      applyState({ leftSidebar: !layout.visiblePanels.leftSidebar, rightSidebar: !layout.visiblePanels.rightSidebar, terminal: !layout.visiblePanels.terminal, editor: false });
    }
    window.addEventListener('agent-ide:apply-layout', onApply);
    return () => window.removeEventListener('agent-ide:apply-layout', onApply);
  }, [applySizes, applyState]);
}

function buildMobilePanelSwitchHandler(acts: MobilePanelActions) {
  return (panel: MobilePanel): void => {
    acts.setActivePanel(panel);
    const map: Record<MobilePanel, () => void> = {
      files: () => { acts.expand('leftSidebar'); acts.collapse('rightSidebar'); },
      chat: () => { acts.collapse('leftSidebar'); acts.expand('rightSidebar'); },
      terminal: () => { acts.collapse('leftSidebar'); acts.collapse('rightSidebar'); acts.expand('terminal'); },
      editor: () => { acts.collapse('leftSidebar'); acts.collapse('rightSidebar'); acts.collapse('terminal'); },
    };
    map[panel]();
  };
}

function useAppLayoutState(props: AppLayoutProps) {
  const { sizes, startResize, resetSize, applySizes } = useResizable();
  const { collapsed, toggle, expand, collapse, applyState } = usePanelCollapse({
    keybindings: props.keybindings,
  });
  const { setFocusedPanel, focusRingStyle: pfs } = useFocusPanel();
  const { activePanel: mobileActivePanel, setActivePanel } = useMobileLayout();
  useApplyLayoutEvent(applySizes, applyState);
  usePanelEventHandlers({
    expand, setFocusedPanel, toggle,
    activateTerminalSession: props.terminalControl.onActivate,
    focusOrCreate: props.terminalControl.focusOrCreate,
    spawnClaudeSession: props.terminalControl.onSpawnClaude,
    spawnCodexSession: props.terminalControl.onSpawnCodex,
  });
  const handleMobilePanelSwitch = useCallback(
    (panel: MobilePanel) => buildMobilePanelSwitchHandler({ expand, collapse, setActivePanel })(panel),
    [expand, collapse, setActivePanel],
  );
  const mkResize = useCallback(
    (panel: 'leftSidebar' | 'rightSidebar' | 'terminal', axis: 'vertical' | 'horizontal') =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        startResize(panel, axis, sizes[panel], axis === 'vertical' ? e.clientX : e.clientY);
      },
    [sizes, startResize],
  );
  return { sizes, resetSize, collapsed, toggle, setFocusedPanel, mobileActivePanel,
    handleMobilePanelSwitch, pfs, mkResize };
}

import type { SlotName } from './layoutPresets/types';

/** Conditionally wraps children in a DroppableSlot when DnD is enabled. */
function MaybeDroppable({
  slot,
  enabled,
  children,
}: {
  slot: SlotName;
  enabled: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  if (!enabled) return <>{children}</>;
  return <DroppableSlot slotName={slot}>{children}</DroppableSlot>;
}

interface CentreColumnProps {
  s: ReturnType<typeof useAppLayoutState>;
  tc: TerminalPaneControl;
  dndEnabled: boolean;
  terminalContent?: React.ReactNode;
  editorTabBar?: React.ReactNode;
  editorContent?: React.ReactNode;
  columnRef?: React.RefObject<HTMLDivElement | null>;
}

function EditorSection({
  s, dndEnabled, editorTabBar, editorContent,
}: Pick<CentreColumnProps, 's' | 'dndEnabled' | 'editorTabBar' | 'editorContent'>): React.ReactElement {
  return (
    <>
      <MaybeDroppable slot="editorContent" enabled={dndEnabled}>
        <div id="editor-main" data-panel="editor" className="contents">
          <CentrePane tabBar={editorTabBar} focusStyle={s.pfs('editor')} onFocus={() => s.setFocusedPanel('editor')}>
            {editorContent}
          </CentrePane>
        </div>
      </MaybeDroppable>
      <ResizeDivider direction="horizontal" onPointerDown={s.mkResize('terminal', 'horizontal')} onDoubleClick={() => s.resetSize('terminal')} label="Resize terminal" />
    </>
  );
}

function CentreColumn({ s, tc, dndEnabled, terminalContent, editorTabBar, editorContent, columnRef }: CentreColumnProps): React.ReactElement {
  return (
    <div ref={columnRef} data-layout="centre-column" className="flex flex-col flex-1 min-w-0 min-h-0">
      {!s.collapsed.editor && (
        <EditorSection s={s} dndEnabled={dndEnabled} editorTabBar={editorTabBar} editorContent={editorContent} />
      )}
      <MaybeDroppable slot="terminalContent" enabled={dndEnabled}>
        <div data-panel="terminal" className="contents">
          <TerminalPane
            height={s.sizes.terminal}
            collapsed={s.collapsed.terminal}
            onToggleCollapse={() => s.toggle('terminal')}
            fillContainer={s.collapsed.editor}
            sessions={tc.sessions}
            activeSessionId={tc.activeSessionId}
            onActivate={tc.onActivate}
            onClose={tc.onClose}
            onNew={tc.onNew}
            onNewClaude={tc.onNewClaude}
            onNewCodex={tc.onNewCodex}
            onReorder={tc.onReorder}
            focusStyle={s.pfs('terminal')}
            onFocus={() => s.setFocusedPanel('terminal')}
          >
            {terminalContent}
          </TerminalPane>
        </div>
      </MaybeDroppable>
    </div>
  );
}

function useCentreColumnSwipe(
  handleMobilePanelSwitch: (p: MobilePanel) => void,
  mobileActivePanel: MobilePanel,
  viewport: ReturnType<typeof useViewportBreakpoint>,
): React.RefObject<HTMLDivElement | null> {
  const columnRef = useRef<HTMLDivElement>(null);
  const ids = MOBILE_NAV_ITEMS.map((i) => i.id);

  const onSwipeLeft = useCallback(() => {
    const cur = ids.indexOf(mobileActivePanel);
    const next = ids[(cur + 1) % ids.length] as MobilePanel;
    handleMobilePanelSwitch(next);
  }, [ids, mobileActivePanel, handleMobilePanelSwitch]);

  const onSwipeRight = useCallback(() => {
    const cur = ids.indexOf(mobileActivePanel);
    const next = ids[(cur - 1 + ids.length) % ids.length] as MobilePanel;
    handleMobilePanelSwitch(next);
  }, [ids, mobileActivePanel, handleMobilePanelSwitch]);

  useSwipeNavigation(columnRef, { onSwipeLeft, onSwipeRight, enabled: viewport === 'phone' });
  return columnRef;
}

type AppLayoutShellState = ReturnType<typeof useAppLayoutState>;

function LeftSidebarSection({
  s, dndEnabled, sidebarHeader, sidebarContent,
}: { s: AppLayoutShellState; dndEnabled: boolean; sidebarHeader?: React.ReactNode; sidebarContent?: React.ReactNode }): React.ReactElement {
  return (
    <>
      <MaybeDroppable slot="sidebarContent" enabled={dndEnabled}>
        <div data-panel="sidebar" className="contents">
          <Sidebar width={s.sizes.leftSidebar} collapsed={false} onToggleCollapse={() => s.toggle('leftSidebar')} header={sidebarHeader} focusStyle={s.pfs('sidebar')} onFocus={() => s.setFocusedPanel('sidebar')}>
            {sidebarContent}
          </Sidebar>
        </div>
      </MaybeDroppable>
      <ResizeDivider direction="vertical" onPointerDown={s.mkResize('leftSidebar', 'vertical')} onDoubleClick={() => s.resetSize('leftSidebar')} label="Resize left sidebar" />
    </>
  );
}

function RightSidebarSection({
  s, dndEnabled, agentCards,
}: { s: AppLayoutShellState; dndEnabled: boolean; agentCards?: React.ReactNode }): React.ReactElement {
  return (
    <>
      {!s.collapsed.rightSidebar && (
        <ResizeDivider direction="vertical" onPointerDown={s.mkResize('rightSidebar', 'vertical')} onDoubleClick={() => s.resetSize('rightSidebar')} label="Resize right sidebar" />
      )}
      <MaybeDroppable slot="agentCards" enabled={dndEnabled}>
        <div data-panel="agent-monitor" style={{ display: s.collapsed.rightSidebar ? 'none' : undefined }}>
          <AgentMonitorPane width={s.sizes.rightSidebar} collapsed={false} onToggleCollapse={() => s.toggle('rightSidebar')} focusStyle={s.pfs('agentMonitor')} onFocus={() => s.setFocusedPanel('agentMonitor')}>
            {agentCards}
          </AgentMonitorPane>
        </div>
      </MaybeDroppable>
    </>
  );
}

function buildStatusLayout(s: AppLayoutShellState, layoutProps: AppLayoutProps['layoutProps']) {
  if (!layoutProps) return undefined;
  return {
    ...layoutProps,
    currentPanelSizes: s.sizes,
    currentVisiblePanels: {
      leftSidebar: !s.collapsed.leftSidebar,
      rightSidebar: !s.collapsed.rightSidebar,
      terminal: !s.collapsed.terminal,
    },
  };
}

function AppLayoutShell(props: AppLayoutProps): React.ReactElement {
  const s = useAppLayoutState(props);
  const { terminalControl: tc, layoutProps } = props;
  const { enabled: dndEnabled } = useDragAndDrop();
  const viewport = useViewportBreakpoint();
  const columnRef = useCentreColumnSwipe(s.handleMobilePanelSwitch, s.mobileActivePanel, viewport);
  const statusLayout = buildStatusLayout(s, layoutProps);
  return (
    <div
      data-layout="app"
      data-mobile-active={s.mobileActivePanel}
      className="flex flex-col w-screen h-screen overflow-hidden bg-surface-base text-text-semantic-primary"
      style={{ fontFamily: 'var(--font-ui, var(--font-mono, monospace))', backgroundImage: 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)' }}
    >
      <a href="#editor-main" className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:p-2 focus:bg-interactive-accent focus:text-text-semantic-on-accent">
        Skip to editor
      </a>
      <TitleBar collapsed={s.collapsed} onTogglePanel={s.toggle} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!s.collapsed.leftSidebar && (
          <LeftSidebarSection s={s} dndEnabled={dndEnabled} sidebarHeader={props.sidebarHeader} sidebarContent={props.sidebarContent} />
        )}
        <CentreColumn s={s} tc={tc} dndEnabled={dndEnabled} terminalContent={props.terminalContent} editorTabBar={props.editorTabBar} editorContent={props.editorContent} columnRef={columnRef} />
        <RightSidebarSection s={s} dndEnabled={dndEnabled} agentCards={props.agentCards} />
      </div>
      <MobileNavBar active={s.mobileActivePanel} onSwitch={s.handleMobilePanelSwitch} />
      <div data-layout="status-bar">
        <StatusBar {...props.statusBar} layout={statusLayout} />
      </div>
    </div>
  );
}

export function AppLayout(props: AppLayoutProps): React.ReactElement {
  const { onDragEnd } = useDropTargets();
  return (
    <DragAndDropProvider onDragEnd={onDragEnd}>
      <AppLayoutShell {...props} />
    </DragAndDropProvider>
  );
}
