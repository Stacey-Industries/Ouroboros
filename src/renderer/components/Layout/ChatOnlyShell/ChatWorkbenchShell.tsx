import React, { Suspense } from 'react';

import { useApprovalContext } from '../../../contexts/ApprovalContext';
import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { CommandPalette } from '../../CommandPalette/CommandPalette';
import type { Command } from '../../CommandPalette/types';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';
import { useChatSidebarMode } from './useChatSidebarMode';
import { useChatWorkbenchLayout } from './useChatWorkbenchLayout';
import { useTerminalDockState } from './useTerminalDockState';
import { useWorkbenchArtifacts } from './useWorkbenchArtifacts';
import { WorkbenchRail } from './WorkbenchRail';

// Lazy — defers TerminalManager + xterm transitive imports until the dock
// actually opens. Keeps chat-only cold boot and jsdom tests lightweight.
const ChatWorkbenchTerminalDock = React.lazy(() =>
  import('./ChatWorkbenchTerminalDock').then((m) => ({ default: m.ChatWorkbenchTerminalDock })),
);
const ChatWorkbenchArtifactPane = React.lazy(() =>
  import('./ChatWorkbenchArtifactPane').then((m) => ({ default: m.ChatWorkbenchArtifactPane })),
);

interface ChatWorkbenchShellProps {
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
  diffOverlayOpen: boolean;
  openDiffOverlay: () => void;
  closeDiffOverlay: () => void;
  toggleDrawer: () => void;
  paletteOpen: boolean;
  closePalette: () => void;
  commands: Command[];
  recentIds: string[];
  execute: (command: Command) => Promise<void>;
}

function ShellToggleButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="rounded border border-stroke-default bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      onClick={onClick}
      aria-pressed={pressed}
    >
      {label}
    </button>
  );
}

interface WorkbenchBodyProps {
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
}

function useAutoOpenUtility(
  layout: ReturnType<typeof useChatWorkbenchLayout>,
): void {
  const { pendingCount } = useApprovalContext();
  const { state } = useDiffReview();
  const lastDiffKeyRef = React.useRef<string | null>(null);
  const lastPendingCountRef = React.useRef(0);

  React.useEffect(() => {
    if (pendingCount > 0 && lastPendingCountRef.current === 0) {
      layout.setUtilityOpen(true);
      layout.setActiveUtilityTab('approvals');
    }
    lastPendingCountRef.current = pendingCount;
  }, [layout, pendingCount]);

  React.useEffect(() => {
    const diffKey = state ? `${state.sessionId}:${state.snapshotHash}` : null;
    if (diffKey && diffKey !== lastDiffKeyRef.current) {
      layout.setUtilityOpen(true);
      layout.setActiveUtilityTab('review');
    }
    lastDiffKeyRef.current = diffKey;
  }, [layout, state]);

  React.useEffect(() => {
    const handleSubagentOpen = (): void => {
      layout.setUtilityOpen(true);
      layout.setActiveUtilityTab('subagents');
    };
    window.addEventListener(OPEN_SUBAGENT_PANEL_EVENT, handleSubagentOpen);
    return () => { window.removeEventListener(OPEN_SUBAGENT_PANEL_EVENT, handleSubagentOpen); };
  }, [layout]);
}

function useAutoOpenArtifacts(
  activeKey: string | null,
  setArtifactOpen: (open: boolean) => void,
): void {
  const lastArtifactKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!activeKey || activeKey === lastArtifactKeyRef.current) return;
    lastArtifactKeyRef.current = activeKey;
    setArtifactOpen(true);
  }, [activeKey, setArtifactOpen]);
}

function WorkbenchToggleRow({
  layout, dock, hasTerminal,
}: {
  layout: ReturnType<typeof useChatWorkbenchLayout>;
  dock: ReturnType<typeof useTerminalDockState>;
  hasTerminal: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-stroke-default bg-surface-panel/70 px-3 py-2">
      <ShellToggleButton label="Rail" pressed={layout.railOpen} onClick={layout.toggleRail} />
      <ShellToggleButton label="Artifact" pressed={layout.artifactOpen} onClick={layout.toggleArtifact} />
      <ShellToggleButton label="Utility" pressed={layout.utilityOpen} onClick={layout.toggleUtility} />
      <ShellToggleButton
        label="Terminal"
        pressed={hasTerminal && dock.visible}
        onClick={dock.toggleVisible}
      />
      <div className="ml-auto text-xs text-text-semantic-tertiary" data-testid="chat-workbench-utility-tab">
        Active utility: {layout.activeUtilityTab}
      </div>
    </div>
  );
}

function UnavailableTerminalDock(): React.ReactElement {
  return (
    <section
      className="h-40 shrink-0 border-t border-stroke-default bg-surface-panel/90 px-3 py-3"
      data-testid="chat-workbench-terminal-dock-unavailable"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Terminal
      </div>
      <p className="mt-2 text-sm text-text-semantic-secondary">
        Terminal sessions are not available in this window.
      </p>
    </section>
  );
}

function ChatWorkbenchBody({ projectRoot, terminal }: WorkbenchBodyProps): React.ReactElement {
  const layout = useChatWorkbenchLayout();
  const dock = useTerminalDockState();
  const artifacts = useWorkbenchArtifacts();
  const hasTerminal = Boolean(terminal);
  useAutoOpenArtifacts(artifacts.activeKey, layout.setArtifactOpen);
  useAutoOpenUtility(layout);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" data-testid="chat-workbench-body">
      {layout.railOpen && <WorkbenchRail title="Workbench" onCreateSession={() => {}} />}
      <div className="flex flex-1 min-w-0 flex-col min-h-0">
        <WorkbenchToggleRow layout={layout} dock={dock} hasTerminal={hasTerminal} />
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
              <AgentChatWorkspace projectRoot={projectRoot} variant="chat-only" />
            </div>
          </main>
          {layout.artifactOpen && (
            <Suspense fallback={null}>
              <ChatWorkbenchArtifactPane onClose={() => layout.setArtifactOpen(false)} />
            </Suspense>
          )}
          {layout.utilityOpen && (
            <ChatWorkbenchUtilityDrawer
              activeTab={layout.activeUtilityTab}
              onSelectTab={layout.setActiveUtilityTab}
              onClose={() => layout.setUtilityOpen(false)}
            />
          )}
        </div>
        {dock.visible && terminal && (
          <Suspense fallback={null}>
            <ChatWorkbenchTerminalDock
              terminal={terminal}
              height={dock.height}
              onHeightChange={dock.setHeight}
              onClose={() => dock.setVisible(false)}
            />
          </Suspense>
        )}
        {dock.visible && !terminal && <UnavailableTerminalDock />}
      </div>
    </div>
  );
}

export function ChatWorkbenchShell({
  projectRoot,
  terminal,
  diffOverlayOpen,
  openDiffOverlay,
  closeDiffOverlay,
  toggleDrawer,
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  execute,
}: ChatWorkbenchShellProps): React.ReactElement {
  const { mode, cycleMode } = useChatSidebarMode();

  return (
    <div
      data-layout="app"
      className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base"
      style={{ backgroundImage: 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)' }}
      data-testid="chat-workbench-shell"
    >
      <ChatOnlyTitleBar onToggleDrawer={toggleDrawer} onCycleSidebarMode={cycleMode} sidebarMode={mode} />
      <ChatWorkbenchBody projectRoot={projectRoot} terminal={terminal} />
      <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
      <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
      <ChatOnlySettingsOverlay />
      <KeyboardShortcutCheatSheet />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        commands={commands}
        recentIds={recentIds}
        onExecute={execute}
      />
    </div>
  );
}
