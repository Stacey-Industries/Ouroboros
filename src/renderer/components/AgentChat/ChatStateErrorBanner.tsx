/**
 * ChatStateErrorBanner.tsx — Hard-fail error banner for the new chat state path.
 *
 * Shown when a ChatStateError fires on the main-process side (Phase 5, Decision 3).
 * Non-dismissable: persists until the user clicks "Restart Chat Session", which
 * resets the in-memory state machine for this thread via chatCommand:restartSession.
 *
 * Visible to all users — new path is the sole code path (flag removed Wave 86).
 * Styled with design tokens per ~/.claude/rules/renderer.md and frontend-design.md.
 */

import type { ChatStateErrorPayload } from '@shared/types/chatStateError';
import React, { useCallback, useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatStateErrorBannerProps {
  threadId: string | null;
}

// ─── API accessor ─────────────────────────────────────────────────────────────

type ChatStateApi = {
  onError: (threadId: string, cb: (err: ChatStateErrorPayload) => void) => () => void;
  restartSession: (threadId: string) => Promise<{ success: boolean; error?: string }>;
};

function getChatStateApi(): ChatStateApi | undefined {
  return (
    window as Window & typeof globalThis & { electronAPI?: { chatStateNewPath?: ChatStateApi } }
  ).electronAPI?.chatStateNewPath;
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function useChatStateError(threadId: string | null): {
  error: ChatStateErrorPayload | null;
  clear: () => void;
} {
  const [error, setError] = useState<ChatStateErrorPayload | null>(null);

  useEffect(() => {
    if (!threadId) {
      setError(null);
      return;
    }
    const api = getChatStateApi();
    if (!api) return;
    return api.onError(threadId, (err) => setError(err));
  }, [threadId]);

  const clear = useCallback(() => setError(null), []);
  return { error, clear };
}

function formatDetails(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function CopyTraceButton({ error }: { error: ChatStateErrorPayload }): React.ReactElement {
  const handleCopy = useCallback(() => {
    const text = JSON.stringify(error, null, 2);
    void navigator.clipboard.writeText(text);
  }, [error]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-3 py-1 text-xs rounded border border-status-error text-status-error hover:bg-status-error-subtle transition-colors"
    >
      Copy Trace
    </button>
  );
}

function RestartButton({
  threadId,
  onRestart,
}: {
  threadId: string;
  onRestart: () => void;
}): React.ReactElement {
  const handleRestart = useCallback(async () => {
    const api = getChatStateApi();
    if (!api) return;
    await api.restartSession(threadId);
    onRestart();
  }, [threadId, onRestart]);

  return (
    <button
      type="button"
      onClick={() => void handleRestart()}
      className="px-3 py-1 text-xs rounded bg-status-error text-text-on-accent hover:opacity-90 transition-opacity"
    >
      Restart Chat Session
    </button>
  );
}

/**
 * Non-dismissable banner shown when a ChatStateError fires on the new path.
 * Mounts only when threadId is non-null and the new path emits an error for it.
 */
export function ChatStateErrorBanner({
  threadId,
}: ChatStateErrorBannerProps): React.ReactElement | null {
  const { error, clear } = useChatStateError(threadId);
  if (!error || !threadId) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex-shrink-0 border border-status-error bg-status-error-subtle px-4 py-3 text-status-error"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Chat state error: {error.kind}</p>
          <p className="text-xs mt-0.5 opacity-80 break-words">{error.message}</p>
          {Object.keys(error.details).length > 0 && (
            <pre className="mt-1 text-xs font-mono opacity-70 whitespace-pre-wrap break-words max-h-20 overflow-auto">
              {formatDetails(error.details)}
            </pre>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <CopyTraceButton error={error} />
          <RestartButton threadId={threadId} onRestart={clear} />
        </div>
      </div>
    </div>
  );
}
