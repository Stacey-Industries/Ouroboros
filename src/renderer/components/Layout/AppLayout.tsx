import React, { useCallback, useEffect, useState } from 'react';

import type { FocusPanel } from '../../contexts/FocusContext';
import { useFocusPanel } from '../../contexts/FocusContext';
import { FOCUS_AGENT_CHAT_EVENT, FOCUS_TERMINAL_SESSION_EVENT, OPEN_AGENT_CHAT_PANEL_EVENT, OPEN_CHAT_IN_TERMINAL_EVENT } from '../../hooks/appEventNames';
import type { WorkspaceLayout } from '../../types/electron';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import { AgentMonitorPane } from './AgentMonitorPane';
import type { MobilePanel } from './AppLayout.mobile';
import { MobileNavBar } from './AppLayout.mobile';
import { CentrePane } from './CentrePane';
import { ResizeDivider } from './ResizeDivider';
import { Sidebar } from './Sidebar';
import type { StatusBarLayoutProps, StatusBarProps } from './StatusBar';
import { StatusBar } from './StatusBar';
import { TerminalPane } from './TerminalPane';
import { TitleBar } from './TitleBar';
import { DragAndDropProvider } from './useDragAndDrop';
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

interface PanelCollapseState { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean; editor: boolean; }

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
        editor: false,
      });
    }

    window.addEventListener('agent-ide:apply-layout', onApply);
    return () => window.removeEventListener('agent-ide:apply-layout', onApply);
  }, [applySizes, applyState]);
}

interface PanelEventHandlerArgs {
  expand: (panel: CollapseTarget) => void;
  setFocusedPanel: (panel: FocusPanel) => void;
  toggle: (panel: CollapseTarget) => void;
  activateTerminalSession?: (id: string) => void;
  focusOrCreate?: (id: string) => void;
  spawnClaudeSession?: (cwd?: string, options?: { resumeMode?: string; label?: string }) => Promise<void>;
  spawnCodexSession?: (cwd?: string, options?: { resumeThreadId?: string; label?: string; model?: string }) => Promise<void>;
}

function buildPanelToggleHandlers(toggle: (panel: CollapseTarget) => void) {
  return {
    onToggleSidebar: () => toggle('leftSidebar'),
    onToggleAgentArea: () => toggle('rightSidebar'),
    onToggleTerminal: () => toggle('terminal'),
    onToggleEditor: () => toggle('editor'),
  };
}

type OpenChatDetail = {
  provider?: 'claude-code' | 'codex'; sessionId?: string;
  claudeSessionId?: string; codexThreadId?: string; model?: string;
};

function resolveOpenChatDetail(event: Event): OpenChatDetail {
  return (event as CustomEvent<OpenChatDetail>).detail;
}

function resolveProvider(detail: OpenChatDetail): 'claude-code' | 'codex' {
  return detail?.provider ?? (detail?.codexThreadId ? 'codex' : 'claude-code');
}

function spawnChatSession(args: PanelEventHandlerArgs, provider: 'claude-code' | 'codex', sessionId: string, model?: string): void {
  if (provider === 'codex') {
    void args.spawnCodexSession?.(undefined, { resumeThreadId: sessionId, label: 'Chat (resumed)', model });
  } else {
    void args.spawnClaudeSession?.(undefined, { resumeMode: sessionId, label: 'Chat (resumed)' });
  }
}

function buildOpenChatInTerminalHandler(args: PanelEventHandlerArgs) {
  return function onOpenChatInTerminal(event: Event): void {
    const detail = resolveOpenChatDetail(event);
    const provider = resolveProvider(detail);
    const sessionId = detail?.sessionId ?? detail?.claudeSessionId ?? detail?.codexThreadId;
    if (!sessionId) return;
    args.expand('terminal');
    args.setFocusedPanel('terminal');
    spawnChatSession(args, provider, sessionId, detail?.model);
  };
}

function usePanelEventHandlers(args: PanelEventHandlerArgs): void {
  const { expand, setFocusedPanel, toggle, activateTerminalSession, focusOrCreate } = args;

  useEffect(() => {
    const toggles = buildPanelToggleHandlers(toggle);
    const onOpenAgentChat = () => { expand('rightSidebar'); setFocusedPanel('agentMonitor'); };
    const onFocusTerminalSession = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (!detail?.sessionId) return;
      expand('terminal');
      setFocusedPanel('terminal');
      if (focusOrCreate) { focusOrCreate(detail.sessionId); } else { activateTerminalSession?.(detail.sessionId); }
    };
    const onOpenChatInTerminal = buildOpenChatInTerminalHandler(args);

    const events: [string, EventListener][] = [
      ['agent-ide:toggle-sidebar', toggles.onToggleSidebar],
      ['agent-ide:toggle-agent-monitor', toggles.onToggleAgentArea],
      ['agent-ide:toggle-terminal', toggles.onToggleTerminal],
      ['agent-ide:toggle-editor', toggles.onToggleEditor],
      [OPEN_AGENT_CHAT_PANEL_EVENT, onOpenAgentChat],
      [FOCUS_AGENT_CHAT_EVENT, onOpenAgentChat],
      [FOCUS_TERMINAL_SESSION_EVENT, onFocusTerminalSession],
      [OPEN_CHAT_IN_TERMINAL_EVENT, onOpenChatInTerminal],
    ];
    for (const [name, handler] of events) window.addEventListener(name, handler);
    return () => { for (const [name, handler] of events) window.removeEventListener(name, handler); };
  }, [args, expand, setFocusedPanel, toggle, activateTerminalSession, focusOrCreate]);
}

function useAppLayoutState(props: AppLayoutProps) {
  const { sizes, startResize, resetSize, applySizes } = useResizable();
  const { collapsed, toggle, expand, collapse, applyState } = usePanelCollapse({ keybindings: props.keybindings });
  const { setFocusedPanel, focusRingStyle: pfs } = useFocusPanel();
  const [mobileActivePanel, setMobileActivePanel] = useState<MobilePanel>('chat');
  useApplyLayoutEvent(applySizes, applyState);
  usePanelEventHandlers({
    expand, setFocusedPanel, toggle,
    activateTerminalSession: props.terminalControl.onActivate,
    focusOrCreate: props.terminalControl.focusOrCreate,
    spawnClaudeSession: props.terminalControl.onSpawnClaude,
    spawnCodexSession: props.terminalControl.onSpawnCodex,
  });
  const handleMobilePanelSwitch = useCallback((panel: MobilePanel) => {
    setMobileActivePanel(panel);
    const actions: Record<MobilePanel, () => void> = {
      files: () => { expand('leftSidebar'); collapse('rightSidebar'); },
      chat: () => { collapse('leftSidebar'); expand('rightSidebar'); },
      terminal: () => { collapse('leftSidebar'); collapse('rightSidebar'); expand('terminal'); },
      editor: () => { collapse('leftSidebar'); collapse('rightSidebar'); collapse('terminal'); },
    };
    actions[panel]();
  }, [expand, collapse]);
  const mkResize = useCallback(
    (panel: 'leftSidebar' | 'rightSidebar' | 'terminal', axis: 'vertical' | 'horizontal') =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        startResize(panel, axis, sizes[panel], axis === 'vertical' ? e.clientX : e.clientY);
      },
    [sizes, startResize],
  );
  return { sizes, resetSize, collapsed, toggle, setFocusedPanel, mobileActivePanel, handleMobilePanelSwitch, pfs, mkResize };
}

export function AppLayout(props: AppLayoutProps): React.ReactElement {
  const s = useAppLayoutState(props);
  const { terminalControl: tc, layoutProps } = props;
  const statusLayout = layoutProps
    ? { ...layoutProps, currentPanelSizes: s.sizes, currentVisiblePanels: { leftSidebar: !s.collapsed.leftSidebar, rightSidebar: !s.collapsed.rightSidebar, terminal: !s.collapsed.terminal } }
    : undefined;

  return (
    <DragAndDropProvider>
      <div data-layout="app" data-mobile-active={s.mobileActivePanel} className="flex flex-col w-screen h-screen overflow-hidden bg-surface-base text-text-semantic-primary" style={{ fontFamily: 'var(--font-ui, var(--font-mono, monospace))', backgroundImage: 'var(--bg-gradient, none)' }}>
        <a href="#editor-main" className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:p-2 focus:bg-interactive-accent focus:text-text-semantic-on-accent">Skip to editor</a>
        <TitleBar collapsed={s.collapsed} onTogglePanel={s.toggle} />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {!s.collapsed.leftSidebar && (
            <>
              <div data-panel="sidebar" className="contents"><Sidebar width={s.sizes.leftSidebar} collapsed={false} onToggleCollapse={() => s.toggle('leftSidebar')} header={props.sidebarHeader} focusStyle={s.pfs('sidebar')} onFocus={() => s.setFocusedPanel('sidebar')}>{props.sidebarContent}</Sidebar></div>
              <ResizeDivider direction="vertical" onPointerDown={s.mkResize('leftSidebar', 'vertical')} onDoubleClick={() => s.resetSize('leftSidebar')} label="Resize left sidebar" />
            </>
          )}
          <div data-layout="centre-column" className="flex flex-col flex-1 min-w-0 min-h-0">
            {!s.collapsed.editor && (
              <>
                <div id="editor-main" data-panel="editor" className="contents"><CentrePane tabBar={props.editorTabBar} focusStyle={s.pfs('editor')} onFocus={() => s.setFocusedPanel('editor')}>{props.editorContent}</CentrePane></div>
                <ResizeDivider direction="horizontal" onPointerDown={s.mkResize('terminal', 'horizontal')} onDoubleClick={() => s.resetSize('terminal')} label="Resize terminal" />
              </>
            )}
            <div data-panel="terminal" className="contents"><TerminalPane height={s.sizes.terminal} collapsed={s.collapsed.terminal} onToggleCollapse={() => s.toggle('terminal')} fillContainer={s.collapsed.editor} sessions={tc.sessions} activeSessionId={tc.activeSessionId} onActivate={tc.onActivate} onClose={tc.onClose} onNew={tc.onNew} onNewClaude={tc.onNewClaude} onNewCodex={tc.onNewCodex} onReorder={tc.onReorder} focusStyle={s.pfs('terminal')} onFocus={() => s.setFocusedPanel('terminal')}>{props.terminalContent}</TerminalPane></div>
          </div>
          {!s.collapsed.rightSidebar && <ResizeDivider direction="vertical" onPointerDown={s.mkResize('rightSidebar', 'vertical')} onDoubleClick={() => s.resetSize('rightSidebar')} label="Resize right sidebar" />}
          <div data-panel="agent-monitor" style={{ display: s.collapsed.rightSidebar ? 'none' : undefined }}>
            <AgentMonitorPane width={s.sizes.rightSidebar} collapsed={false} onToggleCollapse={() => s.toggle('rightSidebar')} focusStyle={s.pfs('agentMonitor')} onFocus={() => s.setFocusedPanel('agentMonitor')}>{props.agentCards}</AgentMonitorPane>
          </div>
        </div>
        <MobileNavBar active={s.mobileActivePanel} onSwitch={s.handleMobilePanelSwitch} />
        <div data-layout="status-bar"><StatusBar {...props.statusBar} layout={statusLayout} /></div>
      </div>
    </DragAndDropProvider>
  );
}
