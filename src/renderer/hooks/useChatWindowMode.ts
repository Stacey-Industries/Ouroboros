/**
 * useChatWindowMode — detects whether the current BrowserWindow was opened
 * as a dedicated chat window (Wave 20 Phase B).
 *
 * The main process opens chat windows with `?mode=chat&sessionId=<id>` appended
 * to the renderer URL (see `src/main/windowManagerChatWindow.ts`). This hook
 * parses those query params once at boot and returns them.
 *
 * When `mode === 'chat'`, the renderer forces the `chat-primary` layout preset
 * regardless of the `layout.chatPrimary` feature-flag state.
 */

import { useMemo } from 'react';

export interface ChatWindowMode {
  /** True when the window was opened with `?mode=chat`. */
  isChatWindow: boolean;
  /** The session id bound to this chat window, if any. */
  sessionId: string | null;
}

function parseChatWindowQuery(search: string): ChatWindowMode {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const sessionId = params.get('sessionId');
  return {
    isChatWindow: mode === 'chat',
    sessionId: sessionId && sessionId.length > 0 ? sessionId : null,
  };
}

export function useChatWindowMode(): ChatWindowMode {
  return useMemo(() => {
    if (typeof window === 'undefined') return { isChatWindow: false, sessionId: null };
    return parseChatWindowQuery(window.location.search);
  }, []);
}

/** Exported for testing — stable signature, pure parse. */
export const __testing = { parseChatWindowQuery };
