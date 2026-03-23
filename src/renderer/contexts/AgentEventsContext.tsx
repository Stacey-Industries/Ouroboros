/**
 * AgentEventsContext.tsx — Provides agent session state at the App level.
 *
 * Lifting useAgentEvents here ensures the IPC listener is always active
 * regardless of whether the AgentMonitorPane is collapsed (and its children
 * unmounted). Without this, events arriving while the panel is collapsed
 * are silently dropped.
 */

import React, { createContext, useContext, useMemo } from 'react';

import type { UseAgentEventsReturn } from '../hooks/useAgentEvents';
import { useAgentEvents } from '../hooks/useAgentEvents';

const AgentEventsContext = createContext<UseAgentEventsReturn | null>(null);

export function AgentEventsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { agents, activeCount, clearCompleted, dismiss, updateNotes, currentSessions, historicalSessions } = useAgentEvents();
  const value = useMemo<UseAgentEventsReturn>(
    () => ({ agents, activeCount, clearCompleted, dismiss, updateNotes, currentSessions, historicalSessions }),
    [agents, activeCount, clearCompleted, dismiss, updateNotes, currentSessions, historicalSessions],
  );
  return (
    <AgentEventsContext.Provider value={value}>
      {children}
    </AgentEventsContext.Provider>
  );
}

export function useAgentEventsContext(): UseAgentEventsReturn {
  const ctx = useContext(AgentEventsContext);
  if (!ctx) throw new Error('useAgentEventsContext must be used inside AgentEventsProvider');
  return ctx;
}
