/**
 * Per-thread chat override hooks extracted from useAgentChatWorkspace to stay within max-lines.
 * Manages chat overrides per thread, persisting them in a ref-based map.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

function promoteDraftOverrides(
  overridesMap: Map<string | null, ChatOverrides>,
  activeThreadId: string,
  previousThreadId: string | null,
): ChatOverrides | undefined {
  const candidateDraftKeys = [previousThreadId, null].filter(
    (key, index, items): key is string | null =>
      items.indexOf(key) === index && (key === null || isDraftThreadId(key)),
  );
  for (const draftKey of candidateDraftKeys) {
    const draftOverrides = overridesMap.get(draftKey);
    if (!draftOverrides) continue;
    overridesMap.set(activeThreadId, draftOverrides);
    overridesMap.delete(draftKey);
    return draftOverrides;
  }
  return undefined;
}

export function usePerThreadOverrides(
  activeThreadId: string | null,
  activeThreadModel?: string | null,
  activeThreadEffort?: string | null,
) {
  const chatOverridesMapRef = useRef<Map<string | null, ChatOverrides>>(new Map());
  const previousThreadIdRef = useRef<string | null>(activeThreadId);
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
    const map = chatOverridesMapRef.current;
    let saved = map.get(activeThreadId);
    if (!saved && activeThreadId && !isDraftThreadId(activeThreadId)) {
      saved = promoteDraftOverrides(map, activeThreadId, previousThreadIdRef.current);
    }
    setChatOverridesState(
      resolveChatOverridesForThread({
        activeThreadId,
        activeThreadModel,
        activeThreadEffort,
        saved,
      }),
    );
    previousThreadIdRef.current = activeThreadId;
  }, [activeThreadEffort, activeThreadId, activeThreadModel]);

  return useMemo(
    () => ({ chatOverrides, setChatOverrides }),
    [chatOverrides, setChatOverrides],
  );
}
