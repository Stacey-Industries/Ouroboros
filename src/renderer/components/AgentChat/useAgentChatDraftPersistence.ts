import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from 'react';

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

function flushDraftToStorage(key: string, draft: string): void {
  try {
    if (draft) {
      localStorage.setItem(key, draft);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function restoreDraftFromStorage(key: string, setDraft: Dispatch<SetStateAction<string>>): void {
  try {
    const stored = localStorage.getItem(key);
    setDraft(stored ?? '');
  } catch {
    setDraft('');
  }
}

function useThreadSwitchPersistence(
  activeThreadId: string | null,
  setDraft: Dispatch<SetStateAction<string>>,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  draftRef: MutableRefObject<string>,
): void {
  const previousThreadIdRef = useRef<string | null>(activeThreadId);

  useEffect(() => {
    if (previousThreadIdRef.current === activeThreadId) return;
    const prevId = previousThreadIdRef.current;
    previousThreadIdRef.current = activeThreadId;

    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    flushDraftToStorage(getDraftKey(prevId), draftRef.current);
    restoreDraftFromStorage(getDraftKey(activeThreadId), setDraft);
  }, [activeThreadId, setDraft, timerRef, draftRef]);
}

function useMountRestoreDraft(activeThreadId: string | null, setDraft: Dispatch<SetStateAction<string>>): void {
  useEffect(() => {
    const stored = localStorage.getItem(getDraftKey(activeThreadId));
    if (stored) setDraft(stored);
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function useDebouncedDraftSave(activeThreadId: string | null, draft: string): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flushDraftToStorage(getDraftKey(activeThreadId), draft);
    }, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeThreadId, draft]);
}

export function useAgentChatDraftPersistence(
  activeThreadId: string | null,
  draft: string,
  setDraft: Dispatch<SetStateAction<string>>,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useThreadSwitchPersistence(activeThreadId, setDraft, timerRef, draftRef);
  useMountRestoreDraft(activeThreadId, setDraft);
  useDebouncedDraftSave(activeThreadId, draft);
}
