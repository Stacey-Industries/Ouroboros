/**
 * ProjectTerminalsContext.tsx — Wave 94 Phase B
 *
 * Provider mounts useProjectTerminals ONCE in ChatWorkbenchShell and
 * exposes both slot handles via context. DockSlot and InnerSidebarTerminals
 * (Phase D) consume useProjectTerminalsContext() — they never call
 * useTerminalSessions() directly.
 *
 * Why context over prop-drill: both DockSlot (dock surface) and
 * InnerSidebarTerminals (rail surface, Phase D) need slot handles but live
 * in different subtree branches. A shared context avoids threading props
 * through ChatWorkbenchTerminalDock → DockSlot AND through TwoTierRailSurface
 * → InnerSidebarTerminals. One mount, two consumers, no ownership fight.
 */

import React, { createContext, useContext, useMemo } from 'react';

import type { UseProjectTerminalsReturn } from '../hooks/useProjectTerminals';
import { EMPTY_SLOT_HANDLE, useProjectTerminals } from '../hooks/useProjectTerminals';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ProjectTerminalsContext = createContext<UseProjectTerminalsReturn | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProjectTerminalsProviderProps {
  activeProjectPath: string | null;
  children: React.ReactNode;
}

export function ProjectTerminalsProvider({
  activeProjectPath,
  children,
}: ProjectTerminalsProviderProps): React.ReactElement {
  const terminals = useProjectTerminals(activeProjectPath);
  const value = useMemo(() => terminals, [terminals]);
  return (
    <ProjectTerminalsContext.Provider value={value}>{children}</ProjectTerminalsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

const FALLBACK: UseProjectTerminalsReturn = {
  primary: EMPTY_SLOT_HANDLE,
  secondary: EMPTY_SLOT_HANDLE,
};

/**
 * Returns the project terminals context. Safe to call outside the provider
 * (returns empty handles) — useful for InnerSidebarTerminals which may render
 * before the workbench shell mounts the provider.
 */
export function useProjectTerminalsContext(): UseProjectTerminalsReturn {
  return useContext(ProjectTerminalsContext) ?? FALLBACK;
}
