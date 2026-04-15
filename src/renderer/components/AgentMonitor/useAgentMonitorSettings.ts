/**
 * useAgentMonitorSettings — reads AgentMonitorSettings for the active session
 * and exposes an updateSettings callback.
 *
 * Subscribes to sessionCrud:changed for live updates.
 */

import { useCallback, useEffect, useState } from 'react';

import type { AgentMonitorSettings } from '../../types/electron';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AgentMonitorSettings = {
  viewMode: 'normal',
  inlineEventTypes: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

async function resolveSettings(): Promise<{
  sessionId: string | null;
  settings: AgentMonitorSettings;
}> {
  if (!hasElectronAPI()) return { sessionId: null, settings: { ...DEFAULT_SETTINGS } };

  const activeResult = await window.electronAPI.sessionCrud.active();
  const sessionId = activeResult.success ? (activeResult.sessionId ?? null) : null;

  if (!sessionId) return { sessionId: null, settings: { ...DEFAULT_SETTINGS } };

  const listResult = await window.electronAPI.sessionCrud.list();
  const sessions = listResult.success && listResult.sessions ? listResult.sessions : [];
  const session = sessions.find((s) => s.id === sessionId);
  const settings = session?.agentMonitorSettings ?? { ...DEFAULT_SETTINGS };

  return { sessionId, settings };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAgentMonitorSettingsResult {
  viewMode: AgentMonitorSettings['viewMode'];
  inlineEventTypes: string[];
  updateSettings: (next: AgentMonitorSettings) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentMonitorSettings(): UseAgentMonitorSettingsResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentMonitorSettings>({ ...DEFAULT_SETTINGS });

  const load = useCallback(async (): Promise<void> => {
    const resolved = await resolveSettings();
    setSessionId(resolved.sessionId);
    setSettings(resolved.settings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasElectronAPI()) return;
    const cleanup = window.electronAPI.sessionCrud.onChanged(() => {
      void load();
    });
    return cleanup;
  }, [load]);

  const updateSettings = useCallback(
    async (next: AgentMonitorSettings): Promise<void> => {
      if (!sessionId || !hasElectronAPI()) return;
      setSettings(next);
      await window.electronAPI.sessionCrud.updateAgentMonitorSettings(sessionId, next);
    },
    [sessionId],
  );

  return {
    viewMode: settings.viewMode,
    inlineEventTypes: settings.inlineEventTypes,
    updateSettings,
  };
}
