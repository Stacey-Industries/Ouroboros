import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

const DRAFT_KEY_PREFIX = 'agentChat:draft:';
const DEBOUNCE_MS = 500;

/** Prefix for draft tab IDs — tabs created by "+" before a message is sent. */
export const DRAFT_ID_PREFIX = '__draft:';

/** Returns true if the thread ID is a temporary draft tab (not yet sent). */
export function isDraftThreadId(id: string | null): boolean {
  return id !== null && id.startsWith(DRAFT_ID_PREFIX);
}

/** Create a unique draft tab ID. */
export function createDraftThreadId(): string {
  return `${DRAFT_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDraftKey(threadId: string | null): string {
  return threadId ? `${DRAFT_KEY_PREFIX}${threadId}` : `${DRAFT_KEY_PREFIX}__new__`;
}

export function clearPersistedDraft(threadId: string | null): void {
  const key = getDraftKey(threadId);
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

export function useAgentChatDraftPersistence(
  activeThreadId: string | null,
  draft: string,
  setDraft: Dispatch<SetStateAction<string>>,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousThreadIdRef = useRef<string | null>(activeThreadId);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Flush old draft + restore new draft when thread changes
  useEffect(() => {
    if (previousThreadIdRef.current === activeThreadId) return;
    const prevId = previousThreadIdRef.current;
    previousThreadIdRef.current = activeThreadId;

    // Flush any pending debounced save for the previous thread
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      const prevKey = getDraftKey(prevId);
      const prevDraft = draftRef.current;
      if (prevDraft) {
        localStorage.setItem(prevKey, prevDraft);
      } else {
        localStorage.removeItem(prevKey);
      }
    } catch {
      // ignore
    }

    const key = getDraftKey(activeThreadId);
    try {
      const stored = localStorage.getItem(key);
      setDraft(stored ?? '');
    } catch {
      setDraft('');
    }
  }, [activeThreadId, setDraft]);

  // Restore draft on initial mount (page reload)
  useEffect(() => {
    const key = getDraftKey(activeThreadId);
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setDraft(stored);
      }
    } catch {
      // ignore
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save of draft to localStorage
  useEffect(() => {
    const key = getDraftKey(activeThreadId);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      try {
        if (draft) {
          localStorage.setItem(key, draft);
        } else {
          localStorage.removeItem(key);
        }
      } catch {
        // ignore
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [activeThreadId, draft]);
}
