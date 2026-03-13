/**
 * ApprovalContext.tsx — Manages the pre-execution approval queue.
 *
 * Listens for approval:request events from the main process and maintains
 * a queue of pending requests. Renders the ApprovalDialog overlay when
 * there are pending approvals.
 *
 * Must be mounted inside a component tree that has access to window.electronAPI.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ApprovalDialog } from '../components/AgentMonitor/ApprovalDialog';
import type { ApprovalRequest } from '../types/electron';

// ─── Context ─────────────────────────────────────────────────────────────────

interface ApprovalContextValue {
  /** Number of pending approval requests */
  pendingCount: number;
}

const ApprovalCtx = createContext<ApprovalContextValue>({ pendingCount: 0 });

export function useApprovalContext(): ApprovalContextValue {
  return useContext(ApprovalCtx);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ApprovalProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Subscribe to approval events
  useEffect(() => {
    if (!window.electronAPI?.approval) return;

    const cleanupRequest = window.electronAPI.approval.onRequest((request) => {
      setRequests((prev) => {
        // Avoid duplicates
        if (prev.some((r) => r.requestId === request.requestId)) return prev;
        return [...prev, request];
      });

      // Play a subtle notification sound
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
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
        // Audio not available — ignore
      }
    });

    const cleanupResolved = window.electronAPI.approval.onResolved((resolved) => {
      setRequests((prev) => prev.filter((r) => r.requestId !== resolved.requestId));
    });

    return () => {
      cleanupRequest();
      cleanupResolved();
    };
  }, []);

  const handleApprove = useCallback((requestId: string) => {
    // Optimistic removal from queue
    setRequests((prev) => prev.filter((r) => r.requestId !== requestId));

    window.electronAPI?.approval?.respond(requestId, 'approve').catch((err) => {
      console.error('[ApprovalProvider] failed to send approve:', err);
    });
  }, []);

  const handleReject = useCallback((requestId: string, reason?: string) => {
    setRequests((prev) => prev.filter((r) => r.requestId !== requestId));

    window.electronAPI?.approval?.respond(requestId, 'reject', reason).catch((err) => {
      console.error('[ApprovalProvider] failed to send reject:', err);
    });
  }, []);

  const handleAlwaysAllow = useCallback((requestId: string, sessionId: string, toolName: string) => {
    // Approve this request + add always-allow rule
    setRequests((prev) => prev.filter((r) => r.requestId !== requestId));

    Promise.all([
      window.electronAPI?.approval?.respond(requestId, 'approve'),
      window.electronAPI?.approval?.alwaysAllow(sessionId, toolName),
    ]).catch((err) => {
      console.error('[ApprovalProvider] failed to always-allow:', err);
    });
  }, []);

  return (
    <ApprovalCtx.Provider value={{ pendingCount: requests.length }}>
      {children}
      {requests.length > 0 && (
        <ApprovalDialog
          requests={requests}
          onApprove={handleApprove}
          onReject={handleReject}
          onAlwaysAllow={handleAlwaysAllow}
        />
      )}
    </ApprovalCtx.Provider>
  );
}
