/**
 * AgentChatComposerSection.helpers.ts — Session data and toggle-state hooks.
 * Extracted from AgentChatComposerSection.tsx to keep that file under 300 lines.
 * Not a public API — import only from AgentChatComposerSection.tsx.
 */
import React, { useCallback, useEffect, useState } from 'react';

import type { Profile, SessionRecord } from '../../types/electron';
import type { ChatOverrides } from './ChatControlsBar';

// ── Session data ──────────────────────────────────────────────────────────────

export interface SessionData {
  profileId: string | null;
  toolOverrides: string[] | undefined;
  mcpServerOverrides: string[] | undefined;
  setProfileId: (id: string) => void;
}

function useSessionLoader(
  sessionId: string | null | undefined,
  setSession: React.Dispatch<React.SetStateAction<SessionRecord | null>>,
  setIsLoaded: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setIsLoaded(false);
      return;
    }
    setIsLoaded(false);
    void window.electronAPI.sessionCrud
      .list()
      .then((res) => {
        if (!res.success || !res.sessions) return;
        setSession(res.sessions.find((x) => x.id === sessionId) ?? null);
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
        return undefined;
      });
    return window.electronAPI.sessionCrud.onChanged((sessions) => {
      setSession(sessions.find((x) => x.id === sessionId) ?? null);
      setIsLoaded(true);
    });
  }, [sessionId, setSession, setIsLoaded]);
}

interface ProfileSyncArgs {
  sessionId: string | null | undefined;
  session: SessionRecord | null;
  isLoaded: boolean;
  chatOverrides: ChatOverrides | undefined;
  onChatOverridesChange: ((overrides: ChatOverrides) => void) | undefined;
  setSession: React.Dispatch<React.SetStateAction<SessionRecord | null>>;
}

function useProfileSyncEffects(args: ProfileSyncArgs): void {
  const { sessionId, session, isLoaded, chatOverrides, onChatOverridesChange, setSession } = args;
  useEffect(() => {
    if (!chatOverrides || !onChatOverridesChange) return;
    const sessionProfileId = session?.profileId ?? null;
    if (sessionProfileId && chatOverrides.profileId !== sessionProfileId) {
      onChatOverridesChange({ ...chatOverrides, profileId: sessionProfileId });
    }
  }, [chatOverrides, onChatOverridesChange, session?.profileId]);

  useEffect(() => {
    if (!sessionId || !isLoaded) return;
    const draftProfileId = chatOverrides?.profileId ?? null;
    if (!draftProfileId || session?.profileId) return;
    void window.electronAPI.sessionCrud
      .setProfile(sessionId, draftProfileId)
      .catch(() => undefined);
    setSession((prev) => (prev ? { ...prev, profileId: draftProfileId } : prev));
  }, [chatOverrides?.profileId, isLoaded, session?.profileId, sessionId, setSession]);
}

export function useSessionData(
  sessionId: string | null | undefined,
  chatOverrides: ChatOverrides | undefined,
  onChatOverridesChange: ((overrides: ChatOverrides) => void) | undefined,
): SessionData {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useSessionLoader(sessionId, setSession, setIsLoaded);
  useProfileSyncEffects({
    sessionId,
    session,
    isLoaded,
    chatOverrides,
    onChatOverridesChange,
    setSession,
  });

  const setProfileId = useCallback(
    (id: string) => {
      if (chatOverrides && onChatOverridesChange && chatOverrides.profileId !== id) {
        onChatOverridesChange({ ...chatOverrides, profileId: id });
      }
      setSession((prev) => (prev ? { ...prev, profileId: id } : prev));
      if (sessionId) void window.electronAPI.sessionCrud.setProfile(sessionId, id);
    },
    [chatOverrides, onChatOverridesChange, sessionId],
  );

  return {
    profileId: session?.profileId ?? chatOverrides?.profileId ?? null,
    toolOverrides: session?.toolOverrides,
    mcpServerOverrides: session?.mcpServerOverrides,
    setProfileId,
  };
}

// ── Active profile ────────────────────────────────────────────────────────────

export function useActiveProfile(profileId: string | null): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      return;
    }
    window.electronAPI.profileCrud
      .list()
      .then((res) => {
        if (!res.success || !res.profiles) return;
        setProfile(res.profiles.find((p) => p.id === profileId) ?? null);
      })
      .catch(() => undefined);
  }, [profileId]);

  return profile;
}

// ── Toggle state ──────────────────────────────────────────────────────────────

export interface ToggleState {
  showTools: boolean;
  showMcp: boolean;
  setShowTools: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMcp: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useComposerToggleState(
  toolOverrides: string[] | undefined,
  chatOverrides: ChatOverrides | undefined,
  onChatOverridesChange: ((o: ChatOverrides) => void) | undefined,
): ToggleState {
  const [showTools, setShowTools] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  useEffect(() => {
    if (!onChatOverridesChange || !chatOverrides) return;
    if (chatOverrides.toolOverrides === toolOverrides) return;
    onChatOverridesChange({ ...chatOverrides, toolOverrides });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolOverrides]);
  return { showTools, setShowTools, showMcp, setShowMcp };
}
