/**
 * RerunMenu.tsx — Wave 22 Phase F
 *
 * Small dropdown that re-runs from a message on a new branch with optional
 * model / effort / permission-mode overrides.
 *
 * Usage:
 *   <RerunMenu messageId={message.id} threadId={thread.id} />
 */
import React, { useCallback, useRef, useState } from 'react';

import {
  ANTHROPIC_OPTIONS,
  CLAUDE_EFFORT_OPTIONS_LIMITED,
  CLAUDE_PERMISSION_MODES,
} from './ChatControlsBarSupport';

// ── Icons ─────────────────────────────────────────────────────────────────────

function RerunIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RerunOverrides {
  model?: string;
  effort?: string;
  permissionMode?: string;
}

export interface RerunMenuProps {
  messageId: string;
  threadId: string;
  onSuccess?: (newThreadId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function buildOverridesPayload(
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

// ── Sub-components ────────────────────────────────────────────────────────────

interface OverrideSectionProps {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}

function OverrideSection(props: OverrideSectionProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-text-semantic-faint">
        {props.label}
      </div>
      {props.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => props.onChange(opt.value)}
          className={[
            'w-full px-2 py-0.5 text-left text-[11px] transition-colors duration-100 hover:bg-surface-raised',
            props.value === opt.value
              ? 'text-interactive-accent font-medium'
              : 'text-text-semantic-primary',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── State hook ────────────────────────────────────────────────────────────────

interface RerunState {
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

function useRerunState(
  threadId: string,
  messageId: string,
  onSuccess?: (id: string) => void,
  onClose?: () => void,
): RerunState {
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('medium');
  const [permissionMode, setPermissionMode] = useState('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRerun = useCallback(async () => {
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
  }, [threadId, messageId, model, effort, permissionMode, onClose, onSuccess]);

  return { model, effort, permissionMode, busy, error, setModel, setEffort, setPermissionMode, handleRerun };
}

// ── Dropdown body ─────────────────────────────────────────────────────────────

function RerunDropdown(props: RerunState): React.ReactElement {
  const sep = <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />;
  return (
    <div
      className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border bg-surface-overlay shadow-lg"
      style={{ borderColor: 'var(--border-semantic)' }}
    >
      <OverrideSection label="Model" options={ANTHROPIC_OPTIONS} value={props.model} onChange={props.setModel} />
      {sep}
      <OverrideSection label="Effort" options={CLAUDE_EFFORT_OPTIONS_LIMITED} value={props.effort} onChange={props.setEffort} />
      {sep}
      <OverrideSection label="Permission" options={CLAUDE_PERMISSION_MODES} value={props.permissionMode} onChange={props.setPermissionMode} />
      {sep}
      <div className="px-2 pb-2 pt-1">
        {props.error && <p className="mb-1 text-[10px] text-status-error">{props.error}</p>}
        <button
          type="button"
          disabled={props.busy}
          onClick={() => void props.handleRerun()}
          className="w-full rounded px-2 py-1 text-[11px] font-medium bg-interactive-accent text-text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {props.busy ? 'Branching…' : 'Re-run on new branch'}
        </button>
      </div>
    </div>
  );
}

// ── RerunMenu ─────────────────────────────────────────────────────────────────

export function RerunMenu({ messageId, threadId, onSuccess }: RerunMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const state = useRerunState(threadId, messageId, onSuccess, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Re-run with model/effort override (always branches)"
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
          'text-text-semantic-muted transition-all duration-100',
          'hover:bg-interactive-accent-subtle hover:text-interactive-accent',
          open ? 'bg-interactive-accent-subtle text-interactive-accent' : '',
        ].join(' ')}
      >
        <RerunIcon />
        <span>Re-run</span>
      </button>
      {open && <RerunDropdown {...state} />}
    </div>
  );
}
