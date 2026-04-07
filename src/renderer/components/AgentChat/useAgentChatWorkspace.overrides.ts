/**
 * Per-thread chat override hooks extracted from useAgentChatWorkspace to stay within max-lines.
 * Manages model/effort overrides per thread, persisting them in a ref-based map.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatOverrides } from './ChatControlsBar';
import { isDraftThreadId } from './useAgentChatDraftPersistence';

export const DEFAULT_CHAT_OVERRIDES: ChatOverrides = {
  model: 'opus[1m]',
  effort: 'medium',
  permissionMode: 'default',
};

function resolveFallbackOverrides(
  activeThreadId: string | null,
  activeThreadModel?: string | null,
  activeThreadEffort?: string | null,
): ChatOverrides {
  if (activeThreadId && !isDraftThreadId(activeThreadId)) {
    return {
      ...DEFAULT_CHAT_OVERRIDES,
      model: activeThreadModel || DEFAULT_CHAT_OVERRIDES.model,
      effort: activeThreadEffort || DEFAULT_CHAT_OVERRIDES.effort,
    };
  }
  return DEFAULT_CHAT_OVERRIDES;
}

export function resolveChatOverridesForThread(args: {
  activeThreadId: string | null;
  activeThreadModel?: string | null;
  activeThreadEffort?: string | null;
  saved?: ChatOverrides;
}): ChatOverrides {
  return (
    args.saved ??
    resolveFallbackOverrides(args.activeThreadId, args.activeThreadModel, args.activeThreadEffort)
  );
}

export function usePerThreadOverrides(
  activeThreadId: string | null,
  activeThreadModel?: string | null,
  activeThreadEffort?: string | null,
) {
  const chatOverridesMapRef = useRef<Map<string | null, ChatOverrides>>(new Map());
  const [chatOverrides, setChatOverridesState] = useState<ChatOverrides>(() => {
    const v = resolveFallbackOverrides(activeThreadId, activeThreadModel, activeThreadEffort);
    chatOverridesMapRef.current.set(activeThreadId, v);
    return v;
  });

  const setChatOverrides = useCallback(
    (overrides: ChatOverrides) => {
      setChatOverridesState(overrides);
      chatOverridesMapRef.current.set(activeThreadId, overrides);
    },
    [activeThreadId],
  );

  useEffect(() => {
    let saved = chatOverridesMapRef.current.get(activeThreadId);
    if (!saved && activeThreadId && !isDraftThreadId(activeThreadId)) {
      const draftOverrides = chatOverridesMapRef.current.get(null);
      if (draftOverrides) {
        chatOverridesMapRef.current.set(activeThreadId, draftOverrides);
        chatOverridesMapRef.current.delete(null);
        saved = draftOverrides;
      }
    }
    setChatOverridesState(
      resolveChatOverridesForThread({
        activeThreadId,
        activeThreadModel,
        activeThreadEffort,
        saved,
      }),
    );
  }, [activeThreadEffort, activeThreadId, activeThreadModel]);

  return { chatOverrides, setChatOverrides };
}
