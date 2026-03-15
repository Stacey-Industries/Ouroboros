import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

const DRAFT_KEY_PREFIX = 'agentChat:draft:';
const DEBOUNCE_MS = 500;

function getDraftKey(threadId: string | null): string | null {
  return threadId ? `${DRAFT_KEY_PREFIX}${threadId}` : null;
}

export function clearPersistedDraft(threadId: string | null): void {
  const key = getDraftKey(threadId);
  if (key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }
}

export function useAgentChatDraftPersistence(
  activeThreadId: string | null,
  draft: string,
  setDraft: Dispatch<SetStateAction<string>>,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousThreadIdRef = useRef<string | null>(activeThreadId);

  // Restore draft when thread changes
  useEffect(() => {
    if (previousThreadIdRef.current === activeThreadId) return;
    previousThreadIdRef.current = activeThreadId;

    const key = getDraftKey(activeThreadId);
    if (!key) {
      setDraft('');
      return;
    }

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
    if (!key) return;

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
    if (!key) return;

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
