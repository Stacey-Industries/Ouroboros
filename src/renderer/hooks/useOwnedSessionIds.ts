import { useMemo } from 'react';

import { useTerminalSessions } from './useTerminalSessions';

/**
 * useOwnedSessionIds — returns the set of Claude session IDs owned by this renderer window.
 *
 * A session is "owned" when it has been associated with a Claude session UUID
 * (i.e., claudeSessionId is defined). This set is used to filter cross-window
 * agent events so each window only reacts to its own terminal sessions.
 */
export function useOwnedSessionIds(): Set<string> {
  const { sessions } = useTerminalSessions();
  return useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.claudeSessionId) ids.add(session.claudeSessionId);
    }
    return ids;
  }, [sessions]);
}
