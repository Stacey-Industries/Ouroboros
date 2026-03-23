import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type ActiveSessionSetter = Dispatch<SetStateAction<string | null>>;
type RecordingSetter = Dispatch<SetStateAction<Set<string>>>;
type KillTimersRef = MutableRefObject<Map<string, ReturnType<typeof setTimeout>[]>>;

export interface ClaudeSessionOptions {
  initialPrompt?: string;
  cliOverrides?: Record<string, unknown>;
  label?: string;
  /** Provider:model override (e.g. 'minimax:MiniMax-M2.7' or 'opus') */
  providerModel?: string;
}

export interface SessionManagerActionArgs {
  sessions: TerminalSession[];
  setSessions: SessionSetter;
  activeSessionId: string | null;
  setActiveSessionId: ActiveSessionSetter;
  recordingSessions: Set<string>;
  setRecordingSessions: RecordingSetter;
  spawnCountRef: MutableRefObject<number>;
  killTimersRef: KillTimersRef;
}

export interface SessionManagerActions {
  spawnSession: (optionalCwd?: string) => Promise<void>;
  spawnClaudeSession: (optionalCwd?: string, options?: ClaudeSessionOptions) => Promise<void>;
  handleTerminalClose: (sessionId: string) => void;
  handleTerminalRestart: (sessionId: string) => Promise<void>;
  handleTerminalTitleChange: (sessionId: string, title: string) => void;
  handleTerminalReorder: (reordered: TerminalSession[]) => void;
  handleSplit: (primarySessionId: string) => Promise<void>;
  handleCloseSplit: (primarySessionId: string) => void;
  handleToggleRecording: (sessionId: string) => Promise<void>;
}

export { useSessionManagerActions } from './useSessionManager.actions';
