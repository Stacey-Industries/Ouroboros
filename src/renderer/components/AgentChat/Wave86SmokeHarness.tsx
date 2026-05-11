/**
 * Wave86SmokeHarness.tsx — TEMPORARY mount for the Phase 1 walking-skeleton smoke.
 *
 * Self-gates on agentChatSettings.chatOrchestration.useNewStateMachine. When off,
 * renders nothing — production users see no UI. When on, renders the debug panel
 * + a "Send hello" trigger so Cole can drive the smoke without dev tools.
 *
 * Delete this file (and its mount in AgentChatWorkspace.tsx) at Phase 6 when the
 * feature flag goes away. The ChatStateNewPathDebugPanel itself is also Phase-6
 * disposable.
 */

import { useCallback, useEffect, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import { ChatStateNewPathDebugPanel } from './ChatStateNewPathDebugPanel';

const SMOKE_THREAD_PREFIX = 'wave86-smoke-';

interface SendStatus {
  state: 'idle' | 'sending' | 'sent' | 'failed';
  message: string | null;
}

function freshSmokeThreadId(): string {
  return `${SMOKE_THREAD_PREFIX}${Date.now().toString(36)}`;
}

function useSmokeState() {
  const [threadId, setThreadId] = useState<string>(() => freshSmokeThreadId());
  const [draft, setDraft] = useState<string>('hello');
  const [status, setStatus] = useState<SendStatus>({ state: 'idle', message: null });
  return { threadId, setThreadId, draft, setDraft, status, setStatus };
}

function buildSender(
  threadId: string,
  draft: string,
  cwd: string,
  setStatus: (s: SendStatus) => void,
): () => Promise<void> {
  return async () => {
    if (!cwd) {
      setStatus({ state: 'failed', message: 'no projectRoot available' });
      return;
    }
    setStatus({ state: 'sending', message: 'dispatching…' });
    try {
      const result = await window.electronAPI.chatStateNewPath.sendMessage({
        threadId,
        content: draft,
        cwd,
      });
      if (result?.success) {
        setStatus({ state: 'sent', message: `sent (turnId: ${result.turnId ?? '?'})` });
      } else {
        setStatus({ state: 'failed', message: result?.error ?? 'unknown error' });
      }
    } catch (err: unknown) {
      setStatus({
        state: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

function StatusLine({ status }: { status: SendStatus }) {
  if (status.state === 'idle') return null;
  const cls = status.state === 'failed' ? 'text-status-error' : 'text-text-semantic-muted';
  return <div className={`text-[10px] ${cls}`}>{status.message}</div>;
}

interface ControlsProps {
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
  onNewThread: () => void;
  sending: boolean;
}

function SmokeControls({ draft, setDraft, onSend, onNewThread, sending }: ControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-semantic-muted">[wave-86 smoke]</span>
      <input
        className="flex-1 bg-surface-inset border border-border-semantic rounded px-2 py-1 text-text-semantic-primary"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="message to send via new path"
        aria-label="smoke message"
      />
      <button
        type="button"
        className="px-2 py-1 bg-interactive-accent text-text-semantic-on-accent rounded"
        onClick={onSend}
        disabled={sending}
      >
        Send
      </button>
      <button
        type="button"
        className="px-2 py-1 bg-surface-inset border border-border-semantic rounded"
        onClick={onNewThread}
        title="new threadId — old smoke threads stick around in main memory"
      >
        New thread
      </button>
    </div>
  );
}

export function Wave86SmokeHarness({ projectRoot }: { projectRoot: string | null }) {
  const { config } = useConfig();
  const flagOn = Boolean(config?.agentChatSettings?.chatOrchestration?.useNewStateMachine);
  const { threadId, setThreadId, draft, setDraft, status, setStatus } = useSmokeState();

  useEffect(() => {
    if (flagOn) setThreadId(freshSmokeThreadId());
  }, [flagOn, setThreadId]);

  const onSend = useCallback(
    () => buildSender(threadId, draft, projectRoot ?? '', setStatus)(),
    [threadId, draft, projectRoot, setStatus],
  );
  const onNewThread = useCallback(() => setThreadId(freshSmokeThreadId()), [setThreadId]);

  if (!flagOn) return null;

  return (
    <div className="border-t border-border-semantic bg-surface-base p-2 space-y-1 text-xs">
      <SmokeControls
        draft={draft}
        setDraft={setDraft}
        onSend={onSend}
        onNewThread={onNewThread}
        sending={status.state === 'sending'}
      />
      <StatusLine status={status} />
      <ChatStateNewPathDebugPanel threadId={threadId} />
    </div>
  );
}
