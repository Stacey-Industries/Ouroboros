/**
 * AppLayout.panelEvents.ts — Panel DOM event utilities extracted from AppLayout.tsx.
 * Keeps AppLayout.tsx under the max-lines limit.
 */

import { useEffect } from 'react';

import type { FocusPanel } from '../../contexts/FocusContext';
import {
  FOCUS_AGENT_CHAT_EVENT,
  FOCUS_TERMINAL_SESSION_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
  OPEN_CHAT_IN_TERMINAL_EVENT,
} from '../../hooks/appEventNames';
import type { CollapseTarget } from './usePanelCollapse';

export interface PanelEventHandlerArgs {
  expand: (panel: CollapseTarget) => void;
  setFocusedPanel: (panel: FocusPanel) => void;
  toggle: (panel: CollapseTarget) => void;
  activateTerminalSession?: (id: string) => void;
  focusOrCreate?: (id: string) => void;
  spawnClaudeSession?: (
    cwd?: string,
    options?: { resumeMode?: string; label?: string },
  ) => Promise<void>;
  spawnCodexSession?: (
    cwd?: string,
    options?: { resumeThreadId?: string; label?: string; model?: string },
  ) => Promise<void>;
}

type OpenChatDetail = {
  provider?: 'claude-code' | 'codex';
  sessionId?: string;
  claudeSessionId?: string;
  codexThreadId?: string;
  model?: string;
};

export function buildPanelToggleHandlers(toggle: (panel: CollapseTarget) => void) {
  return {
    onToggleSidebar: () => toggle('leftSidebar'),
    onToggleAgentArea: () => toggle('rightSidebar'),
    onToggleTerminal: () => toggle('terminal'),
    onToggleEditor: () => toggle('editor'),
  };
}

function resolveOpenChatDetail(event: Event): OpenChatDetail {
  return (event as CustomEvent<OpenChatDetail>).detail;
}

export function resolveProvider(detail: OpenChatDetail): 'claude-code' | 'codex' {
  return detail?.provider ?? (detail?.codexThreadId ? 'codex' : 'claude-code');
}

function spawnChatSession(
  args: PanelEventHandlerArgs,
  provider: 'claude-code' | 'codex',
  sessionId: string,
  model?: string,
): void {
  if (provider === 'codex') {
    void args.spawnCodexSession?.(undefined, { resumeThreadId: sessionId, label: 'Chat (resumed)', model });
  } else {
    void args.spawnClaudeSession?.(undefined, { resumeMode: sessionId, label: 'Chat (resumed)' });
  }
}

function buildOpenChatInTerminalHandler(args: PanelEventHandlerArgs) {
  return function onOpenChatInTerminal(event: Event): void {
    const detail = resolveOpenChatDetail(event);
    const provider = resolveProvider(detail);
    const sessionId = detail?.sessionId ?? detail?.claudeSessionId ?? detail?.codexThreadId;
    if (!sessionId) return;
    args.expand('terminal');
    args.setFocusedPanel('terminal');
    spawnChatSession(args, provider, sessionId, detail?.model);
  };
}

export function usePanelEventHandlers(args: PanelEventHandlerArgs): void {
  const { expand, setFocusedPanel, toggle, activateTerminalSession, focusOrCreate } = args;
  useEffect(() => {
    const toggles = buildPanelToggleHandlers(toggle);
    const onOpenAgentChat = (): void => {
      expand('rightSidebar');
      setFocusedPanel('agentMonitor');
    };
    const onFocusTerminalSession = (event: Event): void => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (!detail?.sessionId) return;
      expand('terminal');
      setFocusedPanel('terminal');
      if (focusOrCreate) { focusOrCreate(detail.sessionId); }
      else { activateTerminalSession?.(detail.sessionId); }
    };
    const onOpenChatInTerminal = buildOpenChatInTerminalHandler(args);
    const events: [string, EventListener][] = [
      ['agent-ide:toggle-sidebar', toggles.onToggleSidebar],
      ['agent-ide:toggle-agent-monitor', toggles.onToggleAgentArea],
      ['agent-ide:toggle-terminal', toggles.onToggleTerminal],
      ['agent-ide:toggle-editor', toggles.onToggleEditor],
      [OPEN_AGENT_CHAT_PANEL_EVENT, onOpenAgentChat],
      [FOCUS_AGENT_CHAT_EVENT, onOpenAgentChat],
      [FOCUS_TERMINAL_SESSION_EVENT, onFocusTerminalSession],
      [OPEN_CHAT_IN_TERMINAL_EVENT, onOpenChatInTerminal],
    ];
    for (const [name, handler] of events) window.addEventListener(name, handler);
    return () => { for (const [name, handler] of events) window.removeEventListener(name, handler); };
  }, [args, expand, setFocusedPanel, toggle, activateTerminalSession, focusOrCreate]);
}
