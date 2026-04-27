/**
 * RerunMenu.state.ts — state hook for RerunMenu (Wave 59 Phase G extraction).
 * Extracted to keep RerunMenu.tsx under the 300-line ESLint limit.
 */
import { useCallback, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RerunOverrides {
  model?: string;
  effort?: string;
  permissionMode?: string;
}

export interface RerunState {
  model: string;
  effort: string;
  permissionMode: string;
  busy: boolean;
  error: string | null;
  setModel: (v: string) => void;
  setEffort: (v: string) => void;
  setPermissionMode: (v: string) => void;
  handleRerun: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function buildOverridesPayload(
  model: string,
  effort: string,
  permissionMode: string,
): RerunOverrides | undefined {
  const ov: RerunOverrides = {};
  if (model) ov.model = model;
  if (effort && effort !== 'medium') ov.effort = effort;
  if (permissionMode && permissionMode !== 'default') ov.permissionMode = permissionMode;
  return Object.keys(ov).length > 0 ? ov : undefined;
}

// ── Handler hook ──────────────────────────────────────────────────────────────

interface UseRerunHandlerArgs {
  threadId: string;
  messageId: string;
  model: string;
  effort: string;
  permissionMode: string;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  onSuccess?: (id: string) => void;
  onClose?: () => void;
}

function useRerunHandler(args: UseRerunHandlerArgs): () => Promise<void> {
  const { threadId, messageId, model, effort, permissionMode, setBusy, setError, onSuccess, onClose } = args;
  return useCallback(async () => {
    if (!hasElectronAPI()) return;
    setBusy(true);
    setError(null);
    try {
      const overrides = buildOverridesPayload(model, effort, permissionMode);
      const result = await window.electronAPI.agentChat.reRunFromMessage(threadId, messageId, overrides);
      if (!result.success) { setError(result.error ?? 'Re-run failed.'); return; }
      onClose?.();
      if (result.thread?.id) onSuccess?.(result.thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [threadId, messageId, model, effort, permissionMode, onClose, onSuccess, setBusy, setError]);
}

// ── State hook ────────────────────────────────────────────────────────────────

export function useRerunState(
  threadId: string,
  messageId: string,
  onSuccess?: (id: string) => void,
  onClose?: () => void,
): RerunState {
  const [model, setModel] = useState('sonnet');
  const [effort, setEffort] = useState('medium');
  const [permissionMode, setPermissionMode] = useState('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRerun = useRerunHandler({ threadId, messageId, model, effort, permissionMode, setBusy, setError, onSuccess, onClose });
  return { model, effort, permissionMode, busy, error, setModel, setEffort, setPermissionMode, handleRerun };
}
