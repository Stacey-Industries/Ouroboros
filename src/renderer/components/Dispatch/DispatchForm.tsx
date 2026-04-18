/**
 * DispatchForm.tsx — form for creating a new dispatch job.
 *
 * Collects: title, prompt, project path (from configured roots), optional
 * worktree name. On submit calls sessions.dispatchTask IPC and notifies the
 * parent via onSuccess / onError callbacks.
 *
 * Wave 34 Phase E. Wave 34 Phase G: offline-queue branch.
 */

import React, { useCallback, useEffect, useId, useState } from 'react';

import {
  enqueueOfflineDispatch,
  listOfflineDispatches,
} from '../../../web/offlineDispatchQueue';
import { useWebConnectionState } from '../../hooks/useWebConnectionState';
import type { DispatchRequest } from '../../types/electron-dispatch';
import { WorktreeFields } from './DispatchForm.parts';
import {
  DANGER_BUTTON_STYLE,
  ERROR_TEXT_STYLE,
  FIELD_GROUP_STYLE,
  INPUT_STYLE,
  PRIMARY_BUTTON_STYLE,
  SCROLLABLE_BODY_STYLE,
  SECTION_LABEL_STYLE,
  SELECT_STYLE,
  TEXTAREA_STYLE,
} from './DispatchScreen.styles';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DispatchFormProps {
  projectRoots: string[];
  onSuccess: (jobId: string) => void;
  onError: (msg: string) => void;
}

interface FormState {
  title: string;
  prompt: string;
  projectPath: string;
  worktreeEnabled: boolean;
  worktreeName: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(state: FormState): string | null {
  if (!state.title.trim()) return 'Title is required.';
  if (!state.prompt.trim()) return 'Prompt is required.';
  if (!state.projectPath) return 'Select a project.';
  if (state.worktreeEnabled && !state.worktreeName.trim()) {
    return 'Worktree name is required when worktree is enabled.';
  }
  return null;
}

function buildRequest(state: FormState): DispatchRequest {
  const req: DispatchRequest = {
    title: state.title.trim(),
    prompt: state.prompt.trim(),
    projectPath: state.projectPath,
  };
  if (state.worktreeEnabled && state.worktreeName.trim()) {
    req.worktreeName = state.worktreeName.trim();
  }
  return req;
}

// ── Submit handler (online) ───────────────────────────────────────────────────

interface SubmitSetters {
  setSubmitting: (v: boolean) => void;
  setInlineError: (v: string | null) => void;
}

async function submitOnline(
  request: DispatchRequest,
  onSuccess: (jobId: string) => void,
  onError: (msg: string) => void,
  setters: SubmitSetters,
): Promise<void> {
  const api = window.electronAPI?.sessions;
  if (!api?.dispatchTask) { onError('Dispatch API unavailable.'); return; }
  setters.setSubmitting(true);
  setters.setInlineError(null);
  try {
    const result = await api.dispatchTask(request);
    if (result.success) {
      onSuccess(result.jobId);
    } else {
      setters.setInlineError(result.error ?? 'Dispatch failed.');
      onError(result.error ?? 'Dispatch failed.');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    setters.setInlineError(msg);
    onError(msg);
  } finally {
    setters.setSubmitting(false);
  }
}

// ── Submit handler (offline) ──────────────────────────────────────────────────

async function submitOffline(
  request: DispatchRequest,
  setInlineError: (v: string | null) => void,
  setQueued: (v: boolean) => void,
  onResetForm: () => void,
): Promise<void> {
  const result = await enqueueOfflineDispatch(request);
  if ('error' in result) {
    setInlineError('Too many offline dispatches queued — try again later.');
    return;
  }
  setQueued(true);
  onResetForm();
}

// ── Submit area ───────────────────────────────────────────────────────────────

interface SubmitAreaProps {
  submitting: boolean;
  isOffline: boolean;
  onCancelSubmit: () => void;
}

function SubmitArea({ submitting, isOffline, onCancelSubmit }: SubmitAreaProps): React.ReactElement {
  const label = submitting
    ? 'Dispatching…'
    : isOffline
    ? 'Save — send when online'
    : 'Dispatch';
  return (
    <>
      <button
        type="submit"
        disabled={submitting}
        style={{ ...PRIMARY_BUTTON_STYLE, opacity: submitting ? 0.6 : 1 }}
        data-testid="dispatch-submit-btn"
      >
        {label}
      </button>
      {submitting && (
        <button type="button" onClick={onCancelSubmit} style={{ ...DANGER_BUTTON_STYLE, width: '100%', marginTop: '6px' }}>
          Cancel
        </button>
      )}
    </>
  );
}

// ── Offline badge ─────────────────────────────────────────────────────────────

function OfflineBadge({ count }: { count: number }): React.ReactElement | null {
  if (count === 0) return null;
  return (
    <p
      style={{ fontSize: '11px', marginBottom: '8px', color: 'var(--status-warning)' }}
      data-testid="offline-queue-badge"
    >
      {count} dispatch{count === 1 ? '' : 'es'} queued offline — will send on reconnect
    </p>
  );
}

// ── Form state hook ───────────────────────────────────────────────────────────

interface FormHookResult {
  id: string;
  state: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  resetForm: () => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  queued: boolean;
  setQueued: (v: boolean) => void;
  inlineError: string | null;
  setInlineError: (v: string | null) => void;
  offlineCount: number;
  setOfflineCount: (v: number) => void;
}

function useDispatchFormState(projectRoots: string[], connState: string): FormHookResult {
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [state, setState] = useState<FormState>({
    title: '', prompt: '', projectPath: projectRoots[0] ?? '', worktreeEnabled: false, worktreeName: '',
  });
  const resetForm = useCallback(() => {
    setState({ title: '', prompt: '', projectPath: projectRoots[0] ?? '', worktreeEnabled: false, worktreeName: '' });
  }, [projectRoots]);
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);
  useEffect(() => {
    void listOfflineDispatches().then((q) => setOfflineCount(q.length));
  }, [connState]);
  return { id, state, set, resetForm, submitting, setSubmitting, queued, setQueued, inlineError, setInlineError, offlineCount, setOfflineCount };
}

// ── Submit handler factory ────────────────────────────────────────────────────

function buildSubmitHandler(
  f: FormHookResult,
  isOffline: boolean,
  onSuccess: (jobId: string) => void,
  onError: (msg: string) => void,
) {
  return async (e: React.FormEvent) => {
    e.preventDefault();
    f.setQueued(false);
    const validationError = validate(f.state);
    if (validationError) { f.setInlineError(validationError); return; }
    const request = buildRequest(f.state);
    if (isOffline) {
      await submitOffline(request, f.setInlineError, f.setQueued, f.resetForm);
      void listOfflineDispatches().then((q) => f.setOfflineCount(q.length));
      return;
    }
    const setters = { setSubmitting: f.setSubmitting, setInlineError: f.setInlineError };
    await submitOnline(request, (jobId) => { f.resetForm(); onSuccess(jobId); }, onError, setters);
  };
}

// ── DispatchForm ──────────────────────────────────────────────────────────────

export function DispatchForm({ projectRoots, onSuccess, onError }: DispatchFormProps): React.ReactElement {
  const connState = useWebConnectionState();
  const isOffline = connState !== 'connected' && connState !== 'electron';
  const f = useDispatchFormState(projectRoots, connState);
  const handleSubmit = useCallback(
    (e: React.FormEvent) => buildSubmitHandler(f, isOffline, onSuccess, onError)(e),
    [f, isOffline, onSuccess, onError],
  );

  return (
    <form onSubmit={handleSubmit} style={SCROLLABLE_BODY_STYLE} data-testid="dispatch-form">
      {isOffline && (
        <p role="status" style={{ ...ERROR_TEXT_STYLE, color: 'var(--status-warning)', border: '1px solid var(--status-warning)', backgroundColor: 'var(--status-warning-subtle)', marginBottom: '8px' }}>
          Desktop offline — your dispatch will send when we reconnect.
        </p>
      )}
      <OfflineBadge count={f.offlineCount} />
      <TitleField id={`${f.id}-title`} value={f.state.title} onChange={(v) => f.set('title', v)} />
      <PromptField id={`${f.id}-prompt`} value={f.state.prompt} onChange={(v) => f.set('prompt', v)} />
      <ProjectField id={`${f.id}-project`} roots={projectRoots} value={f.state.projectPath} onChange={(v) => f.set('projectPath', v)} />
      <WorktreeFields enabled={f.state.worktreeEnabled} name={f.state.worktreeName}
        onToggle={(v) => f.set('worktreeEnabled', v)} onNameChange={(v) => f.set('worktreeName', v)} />
      {f.inlineError && (
        <p role="alert" style={{ ...ERROR_TEXT_STYLE, color: 'var(--status-error)' }}>{f.inlineError}</p>
      )}
      {f.queued && !f.inlineError && (
        <p role="status" style={{ fontSize: '12px', color: 'var(--status-success)', marginTop: '6px' }} data-testid="queued-confirmation">
          Queued locally — will dispatch on reconnect.
        </p>
      )}
      <SubmitArea submitting={f.submitting} isOffline={isOffline} onCancelSubmit={() => f.setSubmitting(false)} />
    </form>
  );
}

// ── Field sub-components ──────────────────────────────────────────────────────

function TitleField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div style={FIELD_GROUP_STYLE}>
      <label htmlFor={id} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
        Title *
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Brief task description"
        required
        style={INPUT_STYLE}
        data-testid="dispatch-title-input"
      />
    </div>
  );
}

function PromptField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div style={FIELD_GROUP_STYLE}>
      <label htmlFor={id} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
        Prompt *
      </label>
      <textarea
        id={id}
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the task in detail…"
        required
        style={TEXTAREA_STYLE}
        data-testid="dispatch-prompt-input"
      />
    </div>
  );
}

function ProjectField({ id, roots, value, onChange }: {
  id: string; roots: string[]; value: string; onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div style={FIELD_GROUP_STYLE}>
      <label htmlFor={id} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
        Project
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={SELECT_STYLE}
        data-testid="dispatch-project-select"
      >
        {roots.length === 0 && <option value="">No projects configured</option>}
        {roots.map((root) => (
          <option key={root} value={root}>{root}</option>
        ))}
      </select>
    </div>
  );
}
