/**
 * ChatOnlyTerminalToolBridge — scoped IDE tool responder for ChatOnlyShell.
 *
 * Wave 88 Phase 4. Subscribes to `window.electronAPI.ideTools.onQuery` and
 * responds only to `getTerminalOutput`, routing the request to the dock's
 * currently-active session instead of the first-registered terminal fallback
 * that `getTerminalLines(undefined)` would produce.
 *
 * File-viewer-flavored queries (`getOpenFiles`, `getActiveFile`,
 * `getUnsavedContent`, `getSelection`) respond with a structured
 * "unavailable in chat-only mode" error envelope so the chat agent can
 * distinguish this from a transport error.
 *
 * Does NOT call useFileViewerManager() — ChatOnlyShell does not mount
 * FileViewerManager at the bridge's scope (Wave 42 design intent).
 * Does NOT reuse useIdeToolResponder — that hook's handler table reaches
 * through IdeToolBridge into useFileViewerManager(). This bridge inlines
 * only what it needs.
 */

import { useEffect } from 'react';

import type { IdeToolQuery } from '../../../types/electron-workspace';
import { getTerminalLines } from '../../Terminal/terminalRegistry';

export interface ChatOnlyTerminalToolBridgeProps {
  /** The dock's currently-active terminal session ID, or null if no dock session. */
  activeDockSessionId: string | null;
}

const CHAT_ONLY_UNAVAILABLE = 'unavailable in chat-only mode';

const FILE_VIEWER_METHODS = new Set([
  'getOpenFiles',
  'getActiveFile',
  'getUnsavedContent',
  'getSelection',
]);

function getTerminalOutputParams(params: unknown): { sessionId?: string; lines?: number } {
  const values = params as { sessionId?: unknown; lines?: unknown } | undefined;
  return {
    sessionId: typeof values?.sessionId === 'string' ? values.sessionId : undefined,
    lines: typeof values?.lines === 'number' ? values.lines : undefined,
  };
}

function handleQuery(query: IdeToolQuery, activeDockSessionId: string | null): void {
  const { queryId, method, params } = query;

  const respond = (result: unknown, error?: string): void => {
    window.electronAPI.ideTools.respond(queryId, result, error).catch(() => {
      // Non-critical — if the respond call fails, the agent query times out.
    });
  };

  if (method === 'getTerminalOutput') {
    const { sessionId, lines } = getTerminalOutputParams(params);
    if (typeof sessionId === 'string') {
      // Caller specified an explicit session — honor it without substitution.
      respond(getTerminalLines(sessionId, lines));
    } else if (activeDockSessionId !== null) {
      // Route to the dock's active session, NOT the first-registered fallback.
      respond(getTerminalLines(activeDockSessionId, lines));
    } else {
      // No dock session active — empty result, not an error.
      respond([]);
    }
    return;
  }

  if (FILE_VIEWER_METHODS.has(method)) {
    respond(null, CHAT_ONLY_UNAVAILABLE);
    return;
  }

  // Unknown method — give the agent a structured signal.
  respond(null, `Unknown method in chat-only mode: ${method}`);
}

export function ChatOnlyTerminalToolBridge({
  activeDockSessionId,
}: ChatOnlyTerminalToolBridgeProps): null {
  useEffect(() => {
    if (!window.electronAPI?.ideTools) return;
    return window.electronAPI.ideTools.onQuery((query) => {
      handleQuery(query, activeDockSessionId);
    });
  }, [activeDockSessionId]);

  return null;
}
