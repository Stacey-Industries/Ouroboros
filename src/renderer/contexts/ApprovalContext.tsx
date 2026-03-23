/**
 * ApprovalContext.tsx - Manages the pre-execution approval queue.
 *
 * Listens for approval:request events from the main process and maintains
 * a queue of pending requests. Renders the ApprovalDialog overlay when
 * there are pending approvals.
 */

import log from 'electron-log/renderer';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ApprovalDialog } from '../components/AgentMonitor/ApprovalDialog';
import type { ApprovalRequest } from '../types/electron';

interface ApprovalContextValue {
  pendingCount: number;
}

const ApprovalCtx = createContext<ApprovalContextValue>({ pendingCount: 0 });

export function useApprovalContext(): ApprovalContextValue {
  return useContext(ApprovalCtx);
}

function playApprovalTone(audioCtxRef: React.MutableRefObject<AudioContext | null>): void {
  try {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio is optional.
  }
}

function useApprovalRequests(): [
  ApprovalRequest[],
  React.Dispatch<React.SetStateAction<ApprovalRequest[]>>,
] {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.approval) return;

    const cleanupRequest = window.electronAPI.approval.onRequest((request) => {
      setRequests((prev) => {
        if (prev.some((queued) => queued.requestId === request.requestId)) return prev;
        return [...prev, request];
      });
      playApprovalTone(audioCtxRef);
    });

    const cleanupResolved = window.electronAPI.approval.onResolved((resolved) => {
      setRequests((prev) => prev.filter((request) => request.requestId !== resolved.requestId));
    });

    return () => {
      cleanupRequest();
      cleanupResolved();
    };
  }, []);

  return [requests, setRequests];
}

function useApprovalActions(
  setRequests: React.Dispatch<React.SetStateAction<ApprovalRequest[]>>,
): Pick<React.ComponentProps<typeof ApprovalDialog>, 'onApprove' | 'onReject' | 'onAlwaysAllow'> {
  const removeRequest = useCallback(
    (requestId: string): void => {
      setRequests((prev) => prev.filter((request) => request.requestId !== requestId));
    },
    [setRequests],
  );

  const onApprove = useCallback(
    (requestId: string) => {
      removeRequest(requestId);
      window.electronAPI?.approval?.respond(requestId, 'approve').catch((err) => {
        log.error('failed to send approve:', err);
      });
    },
    [removeRequest],
  );

  const onReject = useCallback(
    (requestId: string, reason?: string) => {
      removeRequest(requestId);
      window.electronAPI?.approval?.respond(requestId, 'reject', reason).catch((err) => {
        log.error('failed to send reject:', err);
      });
    },
    [removeRequest],
  );

  const onAlwaysAllow = useCallback(
    (requestId: string, sessionId: string, toolName: string) => {
      removeRequest(requestId);
      Promise.all([
        window.electronAPI?.approval?.respond(requestId, 'approve'),
        window.electronAPI?.approval?.alwaysAllow(sessionId, toolName),
      ]).catch((err) => {
        log.error('failed to always-allow:', err);
      });
    },
    [removeRequest],
  );

  return { onApprove, onReject, onAlwaysAllow };
}

export function ApprovalProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [requests, setRequests] = useApprovalRequests();
  const approvalHandlers = useApprovalActions(setRequests);

  return (
    <ApprovalCtx.Provider value={{ pendingCount: requests.length }}>
      {children}
      {requests.length > 0 && <ApprovalDialog requests={requests} {...approvalHandlers} />}
    </ApprovalCtx.Provider>
  );
}
