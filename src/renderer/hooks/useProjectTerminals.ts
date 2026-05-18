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
// PendingSpawn — tracks which slot is awaiting attribution
// ---------------------------------------------------------------------------

interface PendingSpawn {
  slot: 'primary' | 'secondary';
  existingIds: Set<string>;
}

// ---------------------------------------------------------------------------
// buildCloseWrapper — removes the closed session ref from slot state
// ---------------------------------------------------------------------------

function buildCloseWrapper(
  slotKey: 'primary' | 'secondary',
  projectState: ProjectTerminalState,
  setProjectState: (patch: Partial<ProjectTerminalState>) => void,
  terminalClose: (sessionId: string) => void,
): (sessionId: string) => void {
  return (sessionId: string): void => {
    terminalClose(sessionId);
    const updated = projectState[slotKey].filter((r) => r.id !== sessionId);
    const active = projectState.activeSessionPerSlot[slotKey];
    const patch: Partial<ProjectTerminalState> = { [slotKey]: updated };
    if (active === sessionId) {
      patch.activeSessionPerSlot = { ...projectState.activeSessionPerSlot, [slotKey]: null };
    }
    setProjectState(patch);
  };
}

// ---------------------------------------------------------------------------
// buildSpawnWrapper — delegates to terminal.spawnSession, sets pending ref
// ---------------------------------------------------------------------------

interface SpawnWrapperOptions {
  slotKey: 'primary' | 'secondary';
  terminal: UseTerminalSessionsReturn;
  pendingSpawnRef: React.MutableRefObject<PendingSpawn | null>;
  defaultCwd: string | null;
}

function buildSpawnWrapper(opts: SpawnWrapperOptions): (cwd?: string) => Promise<void> {
  const { slotKey, terminal, pendingSpawnRef, defaultCwd } = opts;
  return async (cwd?: string): Promise<void> => {
    const existingIds = new Set(terminal.sessions.map((s) => s.id));
    pendingSpawnRef.current = { slot: slotKey, existingIds };
    await terminal.spawnSession(cwd ?? defaultCwd ?? undefined);
  };
}

// ---------------------------------------------------------------------------
// buildSplitWrapper — same attribution pattern as spawn
// ---------------------------------------------------------------------------

function buildSplitWrapper(
  slotKey: 'primary' | 'secondary',
  terminal: UseTerminalSessionsReturn,
  pendingSpawnRef: React.MutableRefObject<PendingSpawn | null>,
): (primarySessionId: string) => Promise<void> {
  return async (primarySessionId: string): Promise<void> => {
    const existingIds = new Set(terminal.sessions.map((s) => s.id));
    pendingSpawnRef.current = { slot: slotKey, existingIds };
    await terminal.handleSplit(primarySessionId);
  };
}

// ---------------------------------------------------------------------------
// SlotHandleOptions — options object to stay within max-params: 4
// ---------------------------------------------------------------------------

interface SlotHandleOptions {
  slotKey: 'primary' | 'secondary';
  terminal: UseTerminalSessionsReturn;
  projectState: ProjectTerminalState;
  setProjectState: (patch: Partial<ProjectTerminalState>) => void;
  pendingSpawnRef: React.MutableRefObject<PendingSpawn | null>;
  defaultCwd: string | null;
}

// ---------------------------------------------------------------------------
// buildSlotHandle — assemble the public SlotHandle for one slot
// ---------------------------------------------------------------------------

function buildSlotHandle(opts: SlotHandleOptions): SlotHandle {
  const { slotKey, terminal, projectState, setProjectState, pendingSpawnRef, defaultCwd } = opts;
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
    spawnSession: buildSpawnWrapper({ slotKey, terminal, pendingSpawnRef, defaultCwd }),
    handleTerminalClose: buildCloseWrapper(
      slotKey,
      projectState,
      setProjectState,
      terminal.handleTerminalClose,
    ),
    handleTerminalRestart: terminal.handleTerminalRestart,
    handleTerminalTitleChange: terminal.handleTerminalTitleChange,
    handleToggleRecording: terminal.handleToggleRecording,
    handleSplit: buildSplitWrapper(slotKey, terminal, pendingSpawnRef),
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
// SpawnAttributionOptions — keeps useSpawnAttribution within max-params: 4
// ---------------------------------------------------------------------------

interface SpawnAttributionOptions {
  map: TerminalSessionsPerProject;
  setProjectState: (projectPath: string, patch: Partial<ProjectTerminalState>) => void;
  pendingSpawnRef: React.MutableRefObject<PendingSpawn | null>;
}

// ---------------------------------------------------------------------------
// useSpawnAttribution — effect-driven: attributes newly spawned sessions to
// the pending slot recorded in pendingSpawnRef.
// ---------------------------------------------------------------------------

function useSpawnAttribution(
  terminal: UseTerminalSessionsReturn,
  activeProjectPath: string | null,
  opts: SpawnAttributionOptions,
): void {
  const { map, setProjectState, pendingSpawnRef } = opts;
  useEffect(() => {
    const pending = pendingSpawnRef.current;
    if (!pending || !activeProjectPath) return;
    const newSessions = terminal.sessions.filter((s) => !pending.existingIds.has(s.id));
    if (newSessions.length === 0) return;
    pendingSpawnRef.current = null;
    const { slot } = pending;
    const currentState = readProjectState(map, activeProjectPath);
    const existingRefs = new Set(currentState[slot].map((r) => r.id));
    const addedRefs = newSessions
      .filter((s) => !existingRefs.has(s.id))
      .map((s) => ({ id: s.id, title: s.title, isClaude: s.isClaude ?? false }));
    if (addedRefs.length === 0) return;
    const latestId = newSessions[newSessions.length - 1].id;
    setProjectState(activeProjectPath, {
      [slot]: [...currentState[slot], ...addedRefs],
      activeSessionPerSlot: { ...currentState.activeSessionPerSlot, [slot]: latestId },
    });
  }, [terminal.sessions, activeProjectPath, map, setProjectState, pendingSpawnRef]);
}

// ---------------------------------------------------------------------------
// useProjectTerminals — public hook
// ---------------------------------------------------------------------------

export function useProjectTerminals(activeProjectPath: string | null): UseProjectTerminalsReturn {
  const terminal = useTerminalSessions();
  const { map, setProjectState } = useProjectTerminalsMap(activeProjectPath);
  const pendingSpawnRef = useRef<PendingSpawn | null>(null);

  useProjectTerminalsPersist(map);
  useSpawnAttribution(terminal, activeProjectPath, { map, setProjectState, pendingSpawnRef });

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
  const slotOpts = {
    terminal,
    projectState,
    setProjectState: patchState,
    pendingSpawnRef,
    defaultCwd: activeProjectPath,
  };

  return {
    primary: buildSlotHandle({ slotKey: 'primary', ...slotOpts }),
    secondary: buildSlotHandle({ slotKey: 'secondary', ...slotOpts }),
  };
}
