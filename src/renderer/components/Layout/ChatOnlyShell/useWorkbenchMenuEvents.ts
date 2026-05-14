/**
 * useWorkbenchMenuEvents — Wave 82 Phase D.
 *
 * Wires workbench title-bar menu DOM events to existing handlers. Each menu
 * item in `TitleBar.workbench.menus.ts` dispatches a CustomEvent; this hook
 * is the corresponding `addEventListener` consumer.
 *
 * Subscriptions are mounted from `ChatWorkbenchShell` so they have access to
 * `layout` and `dock` from `useShellState`. Cleanup runs on unmount.
 */

import { useEffect } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import {
  WORKBENCH_OPEN_PROJECT_EVENT,
  WORKBENCH_SWITCH_PROJECT_EVENT,
  WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT,
  WORKBENCH_TOGGLE_INNER_SIDEBAR_EVENT,
  WORKBENCH_TOGGLE_OUTER_RAIL_EVENT,
  WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT,
  WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT,
} from '../../../hooks/appEventNames';
import type { useChatWorkbenchLayout } from './useChatWorkbenchLayout';
import type { useTerminalDockState } from './useTerminalDockState';

type Layout = ReturnType<typeof useChatWorkbenchLayout>;
type Dock = ReturnType<typeof useTerminalDockState>;

interface MenuEventDeps {
  layout: Layout;
  dock: Dock;
}

async function pickAndAddProject(
  addProjectRoot: (path: string) => void,
  setActiveProject: (path: string | null) => void,
): Promise<void> {
  const api = window.electronAPI?.files;
  if (!api?.selectFolder) return;
  const result = await api.selectFolder();
  if (!result.success || !result.path) return;
  addProjectRoot(result.path);
  setActiveProject(result.path);
}

function useViewToggleEvents(layout: Layout, dock: Dock): void {
  useEffect(() => {
    const onOuter = (): void => layout.toggleRail();
    const onInner = (): void => layout.toggleRail();
    const onUtility = (): void => layout.toggleUtility();
    const onTerminal = (): void => dock.toggleVisible();
    const onArtifact = (): void => layout.toggleArtifact();
    window.addEventListener(WORKBENCH_TOGGLE_OUTER_RAIL_EVENT, onOuter);
    window.addEventListener(WORKBENCH_TOGGLE_INNER_SIDEBAR_EVENT, onInner);
    window.addEventListener(WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT, onUtility);
    window.addEventListener(WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT, onTerminal);
    window.addEventListener(WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT, onArtifact);
    return () => {
      window.removeEventListener(WORKBENCH_TOGGLE_OUTER_RAIL_EVENT, onOuter);
      window.removeEventListener(WORKBENCH_TOGGLE_INNER_SIDEBAR_EVENT, onInner);
      window.removeEventListener(WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT, onUtility);
      window.removeEventListener(WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT, onTerminal);
      window.removeEventListener(WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT, onArtifact);
    };
  }, [layout, dock]);
}

/**
 * Ctrl+J — toggle terminal dock collapse, mirroring the IDE shell's keybind
 * for `view:toggle-terminal` (`usePanelCollapse` in AppLayout).
 *
 * Wave 88 Phase 5: binding is free in ChatOnly shell (audited: not in
 * chatOnlyCommandFilter.ts, not in ChatWorkbenchShell keyboard handlers).
 */
function useTerminalDockKeybind(dock: Dock): void {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'j' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        dock.toggleVisible();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dock]);
}

function useFileMenuEvents(layout: Layout): void {
  const { addProjectRoot } = useProject();
  useEffect(() => {
    // Wave 82.1 — `WORKBENCH_NEW_CHAT_EVENT` listener removed alongside the
    // "New Chat in Active Session" menu item. The remaining "New Chat" entry
    // dispatches `WORKBENCH_NEW_SESSION_EVENT`, which is handled by
    // `useNewSessionMenuListener` inside ChatWorkbenchBody (canonical path).
    const onOpenProject = (): void => {
      void pickAndAddProject(addProjectRoot, layout.setActiveProject);
    };
    const onSwitchProject = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== 'string') return;
      // Same Wave 82.1 fix as the rail handler: register the path with
      // ProjectContext (so per-window roots include it) before activating,
      // otherwise pathSecurity rejects readDir for the new project.
      addProjectRoot(detail);
      layout.setActiveProject(detail);
    };
    window.addEventListener(WORKBENCH_OPEN_PROJECT_EVENT, onOpenProject);
    window.addEventListener(WORKBENCH_SWITCH_PROJECT_EVENT, onSwitchProject);
    return () => {
      window.removeEventListener(WORKBENCH_OPEN_PROJECT_EVENT, onOpenProject);
      window.removeEventListener(WORKBENCH_SWITCH_PROJECT_EVENT, onSwitchProject);
    };
  }, [addProjectRoot, layout]);
}

export function useWorkbenchMenuEvents({ layout, dock }: MenuEventDeps): void {
  useViewToggleEvents(layout, dock);
  useFileMenuEvents(layout);
  useTerminalDockKeybind(dock);
}
