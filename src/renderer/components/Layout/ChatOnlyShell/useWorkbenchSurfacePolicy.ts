import React from 'react';

import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';
import type { ChatWorkbenchUtilityTab } from './useChatWorkbenchLayout';
import type { WorkbenchArtifactKind } from './useWorkbenchArtifacts';

interface UtilityTrigger {
  key: string;
  tab: ChatWorkbenchUtilityTab;
}

export interface UseWorkbenchSurfacePolicyOptions {
  approvalCount: number;
  diffKey: string | null;
  artifactKey: string | null;
  artifactKind: WorkbenchArtifactKind;
  setArtifactOpen: (open: boolean) => void;
  setUtilityOpen: (open: boolean) => void;
  setActiveUtilityTab: (tab: ChatWorkbenchUtilityTab) => void;
}

export interface UseWorkbenchSurfacePolicyResult {
  closeArtifact: () => void;
  closeUtility: () => void;
}

function artifactTriggerKey(kind: WorkbenchArtifactKind, key: string | null): string | null {
  if (kind === 'empty' || !key) return null;
  return `artifact:${key}`;
}

interface UtilityEffectsArgs {
  approvalCount: number;
  diffKey: string | null;
  openUtility: (trigger: UtilityTrigger) => void;
}

function useUtilityEffects({ approvalCount, diffKey, openUtility }: UtilityEffectsArgs): void {
  React.useEffect(() => {
    if (approvalCount <= 0) return;
    openUtility({ key: `approvals:${approvalCount}`, tab: 'approvals' });
  }, [approvalCount, openUtility]);

  React.useEffect(() => {
    if (!diffKey) return;
    openUtility({ key: `review:${diffKey}`, tab: 'review' });
  }, [diffKey, openUtility]);

  React.useEffect(() => {
    const handleSubagentOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolCallId?: string }>).detail;
      openUtility({ key: `subagents:${detail?.toolCallId ?? 'unknown'}`, tab: 'subagents' });
    };
    window.addEventListener(OPEN_SUBAGENT_PANEL_EVENT, handleSubagentOpen);
    return () => {
      window.removeEventListener(OPEN_SUBAGENT_PANEL_EVENT, handleSubagentOpen);
    };
  }, [openUtility]);
}

export function useWorkbenchSurfacePolicy({ approvalCount, diffKey, artifactKey, artifactKind, setArtifactOpen, setUtilityOpen, setActiveUtilityTab }: UseWorkbenchSurfacePolicyOptions): UseWorkbenchSurfacePolicyResult {
  const dismissedArtifactKeysRef = React.useRef(new Set<string>());
  const dismissedUtilityKeysRef = React.useRef(new Set<string>());
  const currentArtifactKeyRef = React.useRef<string | null>(null);
  const currentUtilityKeyRef = React.useRef<string | null>(null);

  const openUtility = React.useCallback(
    (trigger: UtilityTrigger) => {
      currentUtilityKeyRef.current = trigger.key;
      if (dismissedUtilityKeysRef.current.has(trigger.key)) return;
      setUtilityOpen(true);
      setActiveUtilityTab(trigger.tab);
    },
    [setActiveUtilityTab, setUtilityOpen],
  );

  useUtilityEffects({ approvalCount, diffKey, openUtility });

  React.useEffect(() => {
    const triggerKey = artifactTriggerKey(artifactKind, artifactKey);
    currentArtifactKeyRef.current = triggerKey;
    if (!triggerKey || dismissedArtifactKeysRef.current.has(triggerKey)) return;
    setArtifactOpen(true);
  }, [artifactKey, artifactKind, setArtifactOpen]);

  const closeArtifact = React.useCallback(() => {
    const key = currentArtifactKeyRef.current;
    if (key) dismissedArtifactKeysRef.current.add(key);
    setArtifactOpen(false);
  }, [setArtifactOpen]);

  const closeUtility = React.useCallback(() => {
    const key = currentUtilityKeyRef.current;
    if (key) dismissedUtilityKeysRef.current.add(key);
    setUtilityOpen(false);
  }, [setUtilityOpen]);

  return { closeArtifact, closeUtility };
}
