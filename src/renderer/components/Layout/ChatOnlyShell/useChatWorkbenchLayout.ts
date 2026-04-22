import { useMemo, useState } from 'react';

export type ChatWorkbenchUtilityTab = 'activity' | 'review' | 'approvals' | 'subagents';

export interface ChatWorkbenchLayoutState {
  railOpen: boolean;
  artifactOpen: boolean;
  utilityOpen: boolean;
  terminalOpen: boolean;
  activeUtilityTab: ChatWorkbenchUtilityTab;
}

export interface ChatWorkbenchLayoutApi extends ChatWorkbenchLayoutState {
  toggleRail: () => void;
  setRailOpen: (open: boolean) => void;
  toggleArtifact: () => void;
  setArtifactOpen: (open: boolean) => void;
  toggleUtility: () => void;
  setUtilityOpen: (open: boolean) => void;
  toggleTerminal: () => void;
  setActiveUtilityTab: (tab: ChatWorkbenchUtilityTab) => void;
}

export function useChatWorkbenchLayout(): ChatWorkbenchLayoutApi {
  const [railOpen, setRailOpen] = useState(true);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeUtilityTab, setActiveUtilityTab] = useState<ChatWorkbenchUtilityTab>('activity');

  return useMemo(() => ({
    railOpen,
    artifactOpen,
    utilityOpen,
    terminalOpen,
    activeUtilityTab,
    toggleRail: () => { setRailOpen((value) => !value); },
    setRailOpen,
    toggleArtifact: () => { setArtifactOpen((value) => !value); },
    setArtifactOpen,
    toggleUtility: () => { setUtilityOpen((value) => !value); },
    setUtilityOpen,
    toggleTerminal: () => { setTerminalOpen((value) => !value); },
    setActiveUtilityTab,
  }), [activeUtilityTab, artifactOpen, railOpen, terminalOpen, utilityOpen]);
}
