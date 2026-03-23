/**
 * useSessionManager — manages terminal session lifecycle state.
 *
 * Extracted from App.tsx. Owns sessions array, active session ID,
 * spawn/kill/restart logic, recording state, split pane management,
 * and session persistence.
 */

import { useRef, useState } from 'react';

import type { AppLayoutProps } from '../components/Layout/AppLayout';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import {
  type ClaudeSessionOptions,
  useSessionManagerActions,
} from './useSessionManager.helpers';

export interface SessionManagerResult {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  spawnSession: (optionalCwd?: string) => Promise<void>;
  spawnClaudeSession: (optionalCwd?: string, options?: ClaudeSessionOptions) => Promise<void>;
  handleTerminalClose: (sessionId: string) => void;
  handleTerminalRestart: (sessionId: string) => Promise<void>;
  handleTerminalTitleChange: (sessionId: string, title: string) => void;
  handleTerminalReorder: (reordered: TerminalSession[]) => void;
  handleSplit: (primarySessionId: string) => Promise<void>;
  handleCloseSplit: (primarySessionId: string) => void;
  recordingSessions: Set<string>;
  handleToggleRecording: (sessionId: string) => Promise<void>;
  terminalControl: AppLayoutProps['terminalControl'];
}

function buildTerminalControl(args: {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  spawnSession: (optionalCwd?: string) => Promise<void>;
  spawnClaudeSession: (optionalCwd?: string, options?: ClaudeSessionOptions) => Promise<void>;
  handleTerminalClose: (sessionId: string) => void;
  handleTerminalReorder: (reordered: TerminalSession[]) => void;
}): AppLayoutProps['terminalControl'] {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    spawnSession,
    spawnClaudeSession,
    handleTerminalClose,
    handleTerminalReorder,
  } = args;

  return {
    sessions,
    activeSessionId,
    onActivate: setActiveSessionId,
    onClose: handleTerminalClose,
    onNew: () => void spawnSession(),
    onNewClaude: (providerModel?: string) => void spawnClaudeSession(undefined, providerModel ? { providerModel } : undefined),
    onNewCodex: () => void spawnSession(),
    onReorder: handleTerminalReorder,
  };
}

export function useSessionManager(): SessionManagerResult {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());
  const spawnCountRef = useRef(0);
  const killTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());
  const actions = useSessionManagerActions({ sessions, setSessions, activeSessionId, setActiveSessionId, recordingSessions, setRecordingSessions, spawnCountRef, killTimersRef });
  const terminalControl = buildTerminalControl({
    sessions,
    activeSessionId,
    setActiveSessionId,
    spawnSession: actions.spawnSession,
    spawnClaudeSession: actions.spawnClaudeSession,
    handleTerminalClose: actions.handleTerminalClose,
    handleTerminalReorder: actions.handleTerminalReorder,
  });
  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    spawnSession: actions.spawnSession,
    spawnClaudeSession: actions.spawnClaudeSession,
    handleTerminalClose: actions.handleTerminalClose,
    handleTerminalRestart: actions.handleTerminalRestart,
    handleTerminalTitleChange: actions.handleTerminalTitleChange,
    handleTerminalReorder: actions.handleTerminalReorder,
    handleSplit: actions.handleSplit,
    handleCloseSplit: actions.handleCloseSplit,
    recordingSessions,
    handleToggleRecording: actions.handleToggleRecording,
    terminalControl,
  };
}
