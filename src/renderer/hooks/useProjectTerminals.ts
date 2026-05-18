/**
 * useProjectTerminals.ts — Wave 94 Phase B
 *
 * Single source of truth for per-project terminal session ownership.
 * Replaces per-slot useTerminalSessions() calls in DockSlot.tsx.
 *
 * ADR Decision 2a: one hook, Map<projectPath, ProjectTerminalState>,
 * atomic swap on project change via electron-store key
 * `terminalSessionsPerProject`.
 *
 * Mount ONCE via ProjectTerminalsProvider in ChatWorkbenchShell.
 * Consumers call useProjectTerminalsContext() rather than useTerminalSessions().
 */

import { useCallback, useEffect, useRef } from 'react';

import type {
  ProjectTerminalState,
  TerminalSessionsPerProject,
} from '../../shared/config/projectTerminalsSchema';
import {
  parseTerminalSessionsPerProject,
  readProjectState,
} from '../../shared/config/projectTerminalsSchema';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import { useProjectTerminalsMap, useProjectTerminalsPersist } from './useProjectTerminals.effects';
import type { UseTerminalSessionsReturn } from './useTerminalSessions';
import { useTerminalSessions } from './useTerminalSessions';

export type { ProjectTerminalState } from '../../shared/config/projectTerminalsSchema';
export { parseTerminalSessionsPerProject };
export type { TerminalSessionsPerProject };

// ---------------------------------------------------------------------------
// SlotHandle — public contract for each slot consumer
// ---------------------------------------------------------------------------

export interface SlotHandle {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  recordingSessions: Set<string>;
  spawnSession: (cwd?: string) => Promise<void>;
  handleTerminalClose: (sessionId: string) => void;
  handleTerminalRestart: (sessionId: string) => Promise<void>;
  handleTerminalTitleChange: (sessionId: string, title: string) => void;
  handleToggleRecording: (sessionId: string) => Promise<void>;
  handleSplit: (primarySessionId: string) => Promise<void>;
  handleCloseSplit: (primarySessionId: string) => void;
  handleTerminalReorder: (reordered: TerminalSession[]) => void;
}

export interface UseProjectTerminalsReturn {
  primary: SlotHandle;
  secondary: SlotHandle;
}

// ---------------------------------------------------------------------------
// Empty handle returned when activeProjectPath is null
// ---------------------------------------------------------------------------

function makeNoopAsync(): () => Promise<void> {
  return () => Promise.resolve();
}

export const EMPTY_SLOT_HANDLE: SlotHandle = {
  sessions: [],
  activeSessionId: null,
  setActiveSessionId: () => undefined,
  recordingSessions: new Set(),
  spawnSession: makeNoopAsync(),
  handleTerminalClose: () => undefined,
  handleTerminalRestart: makeNoopAsync(),
  handleTerminalTitleChange: () => undefined,
  handleToggleRecording: makeNoopAsync(),
  handleSplit: makeNoopAsync(),
  handleCloseSplit: () => undefined,
  handleTerminalReorder: () => undefined,
};

// ---------------------------------------------------------------------------
// buildSlotSessionList — filter global pool to slot membership
// ---------------------------------------------------------------------------

function buildSlotSessionList(
  allSessions: TerminalSession[],
  slotRefs: ProjectTerminalState['primary'],
): TerminalSession[] {
  const ids = new Set(slotRefs.map((r) => r.id));
  return allSessions.filter((s) => ids.has(s.id));
}

// ---------------------------------------------------------------------------
// buildReorderHandler — keep slot refs in sync with drag reorder
// ---------------------------------------------------------------------------

function buildReorderHandler(
  slotKey: 'primary' | 'secondary',
  projectState: ProjectTerminalState,
  setProjectState: (patch: Partial<ProjectTerminalState>) => void,
  terminalReorder: (r: TerminalSession[]) => void,
): (reordered: TerminalSession[]) => void {
  return (reordered: TerminalSession[]): void => {
    const ids = new Set(projectState[slotKey].map((s) => s.id));
    setProjectState({
      [slotKey]: reordered
        .filter((s) => ids.has(s.id))
        .map((s) => ({ id: s.id, title: s.title, isClaude: s.isClaude ?? false })),
    });
    terminalReorder(reordered);
  };
}

// ---------------------------------------------------------------------------
// buildSlotHandle — assemble the public SlotHandle for one slot
// ---------------------------------------------------------------------------

function buildSlotHandle(
  slotKey: 'primary' | 'secondary',
  terminal: UseTerminalSessionsReturn,
  projectState: ProjectTerminalState,
  setProjectState: (patch: Partial<ProjectTerminalState>) => void,
): SlotHandle {
  const sessions = buildSlotSessionList(terminal.sessions, projectState[slotKey]);
  const slotIds = new Set(projectState[slotKey].map((s) => s.id));
  const rawActive = projectState.activeSessionPerSlot[slotKey];
  const activeSessionId = rawActive && slotIds.has(rawActive) ? rawActive : null;

  const setActiveSessionId = (id: string | null): void => {
    setProjectState({
      activeSessionPerSlot: { ...projectState.activeSessionPerSlot, [slotKey]: id },
    });
    if (id) terminal.setActiveSessionId(id);
  };

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    recordingSessions: terminal.recordingSessions,
    spawnSession: terminal.spawnSession,
    handleTerminalClose: terminal.handleTerminalClose,
    handleTerminalRestart: terminal.handleTerminalRestart,
    handleTerminalTitleChange: terminal.handleTerminalTitleChange,
    handleToggleRecording: terminal.handleToggleRecording,
    handleSplit: terminal.handleSplit,
    handleCloseSplit: terminal.handleCloseSplit,
    handleTerminalReorder: buildReorderHandler(
      slotKey,
      projectState,
      setProjectState,
      terminal.handleTerminalReorder,
    ),
  };
}

// ---------------------------------------------------------------------------
// useProjectTerminals — public hook
// ---------------------------------------------------------------------------

export function useProjectTerminals(activeProjectPath: string | null): UseProjectTerminalsReturn {
  const terminal = useTerminalSessions();
  const { map, setProjectState } = useProjectTerminalsMap(activeProjectPath);
  const prevProjectRef = useRef<string | null>(null);

  useEffect(() => {
    prevProjectRef.current = activeProjectPath;
  }, [activeProjectPath]);

  useProjectTerminalsPersist(map);

  const patchState = useCallback(
    (patch: Partial<ProjectTerminalState>): void => {
      if (activeProjectPath) setProjectState(activeProjectPath, patch);
    },
    [activeProjectPath, setProjectState],
  );

  if (!activeProjectPath) {
    return { primary: EMPTY_SLOT_HANDLE, secondary: EMPTY_SLOT_HANDLE };
  }

  const projectState = readProjectState(map, activeProjectPath);

  return {
    primary: buildSlotHandle('primary', terminal, projectState, patchState),
    secondary: buildSlotHandle('secondary', terminal, projectState, patchState),
  };
}
