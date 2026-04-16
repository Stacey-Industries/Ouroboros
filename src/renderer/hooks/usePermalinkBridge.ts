/**
 * usePermalinkBridge — relays main-process `app:navigateToPermalink` IPC
 * pushes to the renderer-scoped `agent-ide:open-thread` DOM event.
 *
 * Registered once at InnerApp level. Consumers (AgentChatWorkspace, etc.)
 * listen for the DOM event — never for the IPC directly.
 */

import { useEffect } from 'react';

import { OPEN_THREAD_EVENT } from './appEventNames';

export function usePermalinkBridge(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.app?.onNavigateToPermalink) return;
    const cleanup = window.electronAPI.app.onNavigateToPermalink(({ threadId, messageId }) => {
      window.dispatchEvent(new CustomEvent(OPEN_THREAD_EVENT, { detail: { threadId, messageId } }));
    });
    return cleanup;
  }, []);
}
