/**
 * ChatWorkbenchTerminalDock — docked terminal surface for chat-workbench shell.
 *
 * Wave 46 Phase C: mounts the shared TerminalManager inside a resizable,
 * collapsible dock at the bottom of the workbench. Reuses the existing
 * terminal session state — no second PTY stack.
 *
 * Wave 88 Phase 3: replaced bespoke useDockResize (window-level pointer listeners,
 * no pointer capture) with the shared useResizable hook, reusing the 'terminal'
 * PanelId. Dock height now persists to electron-store alongside IDE shell's terminal
 * panel via panelSizes.terminal. One-time migration from the old localStorage key
 * runs on first mount.
 */

import React, { useEffect, useRef } from 'react';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { ErrorBoundary } from '../../shared/ErrorBoundary';
import { TerminalManager } from '../../Terminal/TerminalManager';
import { useResizable } from '../useResizable';
import { useDockHandlers } from './ChatWorkbenchTerminalDock.handlers';

/** localStorage key used by the pre-Wave-88 useTerminalDockState hook. */
const LEGACY_DOCK_STORAGE_KEY = 'agent-ide:chat-workbench-terminal-dock';

/**
 * Must match DEFAULT_SIZES.terminal / MIN_SIZES.terminal / MAX_SIZES.terminal
 * in useResizable.ts. Duplicated here to avoid a cross-module import just for
 * three constants, but must be kept in sync if those values ever change.
 */
const TERMINAL_DEFAULT_SIZE = 280;
const TERMINAL_MIN_SIZE = 120;
const TERMINAL_MAX_SIZE = 600;

/**
 * One-time forward migration: if the old localStorage dock state exists AND the
 * user has not already set a custom terminal size, seed the shared
 * panelSizes.terminal via applySizes and clear the legacy key.
 *
 * The non-destructive guard (`currentSizes.terminal === TERMINAL_DEFAULT_SIZE`) is
 * the critical addition in Wave 88's smoke-bug fix. Without it, the migration
 * fires unconditionally on the first post-Wave-88 boot and overwrites any terminal
 * height the user had already persisted — producing a silent reset that looks like
 * "dock opened at default size." The legacy key is consumed on first mount
 * regardless, so this can only run once per machine.
 *
 * Runs on first mount; subsequent mounts see no legacy key and are no-ops.
 */
function runLegacyDockHeightMigration(
  currentSizes: ReturnType<typeof useResizable>['sizes'],
  applySizes: ReturnType<typeof useResizable>['applySizes'],
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LEGACY_DOCK_STORAGE_KEY);
    if (!raw) return;
    // Consume the legacy key unconditionally — prevents a retry on the next mount
    // even if we decide not to apply the value below.
    window.localStorage.removeItem(LEGACY_DOCK_STORAGE_KEY);
    const parsed = JSON.parse(raw) as { height?: unknown };
    const legacyHeight = parsed.height;
    // Apply the legacy value only when:
    //   (a) it is a finite number within the valid range, AND
    //   (b) the user has not already set a custom terminal height.
    // Guard (b) is what makes this non-destructive: if panelSizes.terminal is
    // anything other than the default, treat that as authoritative and skip.
    if (
      typeof legacyHeight === 'number' &&
      Number.isFinite(legacyHeight) &&
      legacyHeight >= TERMINAL_MIN_SIZE &&
      legacyHeight <= TERMINAL_MAX_SIZE &&
      currentSizes.terminal === TERMINAL_DEFAULT_SIZE
    ) {
      applySizes({ ...currentSizes, terminal: legacyHeight });
    }
  } catch {
    // Non-critical — if migration fails, the user loses their old dock height
    // preference but the app continues with the default.
    try {
      window.localStorage.removeItem(LEGACY_DOCK_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export interface ChatWorkbenchTerminalDockProps {
  terminal: UseTerminalSessionsReturn;
  onClose: () => void;
}


const DOCK_BTN_BASE = 'rounded px-2 py-0.5 text-xs text-text-semantic-secondary transition-colors';
const DOCK_BTN_HOVER = 'hover:bg-surface-hover hover:text-text-semantic-primary';
const DOCK_BTN_DANGER =
  'hover:bg-surface-hover hover:text-status-error disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-semantic-secondary';

function DockCloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className={`${DOCK_BTN_BASE} ${DOCK_BTN_HOVER}`}
      onClick={onClose}
      data-testid="chat-workbench-dock-close"
      aria-label="Close terminal dock"
    >
      ✕
    </button>
  );
}

interface DockHeaderActionsProps {
  onSpawn: () => void;
  onNewClaude: () => void;
  onNewCodex: () => void;
  onCloseSession: () => void;
  canCloseSession: boolean;
  activeSessionId: string | null;
  isRecording: boolean;
  onToggleRecording: () => void;
  onClose: () => void;
}

function DockSpawnButtons({
  onSpawn,
  onNewClaude,
  onNewCodex,
}: Pick<DockHeaderActionsProps, 'onSpawn' | 'onNewClaude' | 'onNewCodex'>): React.ReactElement {
  return (
    <>
      <button
        type="button"
        className={`${DOCK_BTN_BASE} ${DOCK_BTN_HOVER}`}
        onClick={onSpawn}
        data-testid="chat-workbench-dock-spawn"
      >
        + New
      </button>
      <button
        type="button"
        className={`${DOCK_BTN_BASE} ${DOCK_BTN_HOVER}`}
        onClick={onNewClaude}
        data-testid="chat-workbench-dock-new-claude"
        title="New Claude session"
      >
        + Claude
      </button>
      <button
        type="button"
        className={`${DOCK_BTN_BASE} ${DOCK_BTN_HOVER}`}
        onClick={onNewCodex}
        data-testid="chat-workbench-dock-new-codex"
        title="New Codex session"
      >
        + Codex
      </button>
    </>
  );
}

function RecordingButton({
  activeSessionId,
  isRecording,
  onToggleRecording,
}: Pick<DockHeaderActionsProps, 'activeSessionId' | 'isRecording' | 'onToggleRecording'>): React.ReactElement {
  return (
    <button
      type="button"
      className={`${DOCK_BTN_BASE} flex items-center gap-1 ${DOCK_BTN_HOVER}`}
      onClick={onToggleRecording}
      disabled={!activeSessionId}
      data-testid="chat-workbench-dock-recording-toggle"
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      aria-pressed={isRecording}
      title={isRecording ? 'Stop recording' : 'Start recording'}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${isRecording ? 'bg-status-error' : 'bg-text-semantic-muted'}`}
        aria-hidden="true"
      />
      Rec
    </button>
  );
}

function DockSessionControls({
  activeSessionId,
  isRecording,
  onToggleRecording,
  canCloseSession,
  onCloseSession,
  onClose,
}: Pick<
  DockHeaderActionsProps,
  'activeSessionId' | 'isRecording' | 'onToggleRecording' | 'canCloseSession' | 'onCloseSession' | 'onClose'
>): React.ReactElement {
  return (
    <>
      <RecordingButton
        activeSessionId={activeSessionId}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
      />
      <button
        type="button"
        disabled={!canCloseSession}
        className={`${DOCK_BTN_BASE} ${DOCK_BTN_DANGER}`}
        onClick={onCloseSession}
        data-testid="chat-workbench-dock-close-session"
        aria-label="Close active terminal session"
        title="Close active terminal session"
      >
        Close session
      </button>
      <DockCloseButton onClose={onClose} />
    </>
  );
}

function DockHeaderActions(props: DockHeaderActionsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <DockSpawnButtons
        onSpawn={props.onSpawn}
        onNewClaude={props.onNewClaude}
        onNewCodex={props.onNewCodex}
      />
      <DockSessionControls
        activeSessionId={props.activeSessionId}
        isRecording={props.isRecording}
        onToggleRecording={props.onToggleRecording}
        canCloseSession={props.canCloseSession}
        onCloseSession={props.onCloseSession}
        onClose={props.onClose}
      />
    </div>
  );
}

function DockHeader(props: DockHeaderActionsProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-semantic px-3 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Terminal
      </div>
      <DockHeaderActions {...props} />
    </div>
  );
}

function DockResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}): React.ReactElement {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal dock"
      className="h-1 cursor-ns-resize bg-transparent transition-colors hover:bg-interactive-accent"
      onPointerDown={onPointerDown}
      data-testid="chat-workbench-dock-resize"
    />
  );
}

function DockTerminalSurface({
  terminal,
}: {
  terminal: UseTerminalSessionsReturn;
}): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <ErrorBoundary label="ChatWorkbenchTerminal">
        <TerminalManager
          sessions={terminal.sessions}
          activeSessionId={terminal.activeSessionId}
          onRestart={terminal.handleTerminalRestart}
          onClose={terminal.handleTerminalClose}
          onTitleChange={terminal.handleTerminalTitleChange}
          onSpawn={() => void terminal.spawnSession()}
          recordingSessions={terminal.recordingSessions}
          onToggleRecording={(id) => void terminal.handleToggleRecording(id)}
          onSplit={(id) => void terminal.handleSplit(id)}
          onCloseSplit={terminal.handleCloseSplit}
        />
      </ErrorBoundary>
    </div>
  );
}

export function ChatWorkbenchTerminalDock({
  terminal,
  onClose,
}: ChatWorkbenchTerminalDockProps): React.ReactElement {
  const { sizes, startResize, applySizes } = useResizable();

  // One-time migration from pre-Wave-88 localStorage dock height. Snapshot the
  // initial sizes/applySizes in a ref so the empty dep array is genuinely
  // correct (the migration must run exactly once on mount) — this replaces a
  // misplaced eslint-disable from the Phase 3 commit that did not actually
  // suppress the exhaustive-deps warning.
  const migrationRef = useRef({ sizes, applySizes });
  useEffect(() => {
    runLegacyDockHeightMigration(migrationRef.current.sizes, migrationRef.current.applySizes);
  }, []);

  const handlers = useDockHandlers(terminal, sizes, startResize);

  return (
    <section
      className="flex shrink-0 flex-col border-t border-border-semantic bg-surface-panel/95"
      style={{ height: sizes.terminal }}
      data-testid="chat-workbench-terminal-dock"
    >
      <DockResizeHandle onPointerDown={handlers.handleResizePointerDown} />
      <DockHeader
        onSpawn={() => void terminal.spawnSession()}
        onNewClaude={handlers.handleNewClaude}
        onNewCodex={handlers.handleNewCodex}
        onCloseSession={handlers.handleCloseSession}
        canCloseSession={Boolean(terminal.activeSessionId)}
        activeSessionId={terminal.activeSessionId}
        isRecording={handlers.isRecording}
        onToggleRecording={handlers.handleToggleRecording}
        onClose={onClose}
      />
      <DockTerminalSurface terminal={terminal} />
    </section>
  );
}
