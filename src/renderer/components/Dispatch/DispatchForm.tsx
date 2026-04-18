/**
 * DispatchForm.tsx — form for creating a new dispatch job.
 *
 * Collects: title, prompt, project path (from configured roots), optional
 * worktree name. On submit calls sessions.dispatchTask IPC and notifies the
 * parent via onSuccess / onError callbacks.
 *
 * Wave 34 Phase E.
 */

import React, { useCallback, useId, useState } from 'react';

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

// ── Submit handler ────────────────────────────────────────────────────────────

interface SubmitSetters {
  setSubmitting: (v: boolean) => void;
  setInlineError: (v: string | null) => void;
}

async function submitDispatch(
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

// ── Submit buttons ────────────────────────────────────────────────────────────

function SubmitArea({ submitting, onCancelSubmit }: { submitting: boolean; onCancelSubmit: () => void }): React.ReactElement {
  return (
    <>
      <button type="submit" disabled={submitting} style={{ ...PRIMARY_BUTTON_STYLE, opacity: submitting ? 0.6 : 1 }}>
        {submitting ? 'Dispatching…' : 'Dispatch'}
      </button>
      {submitting && (
        <button type="button" onClick={onCancelSubmit} style={{ ...DANGER_BUTTON_STYLE, width: '100%', marginTop: '6px' }}>
          Cancel
        </button>
      )}
    </>
  );
}

// ── DispatchForm ──────────────────────────────────────────────────────────────

export function DispatchForm({ projectRoots, onSuccess, onError }: DispatchFormProps): React.ReactElement {
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [state, setState] = useState<FormState>({
    title: '', prompt: '', projectPath: projectRoots[0] ?? '', worktreeEnabled: false, worktreeName: '',
  });
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(state);
    if (validationError) { setInlineError(validationError); return; }
    const request = buildRequest(state);
    await submitDispatch(request, (jobId) => {
      setState({ title: '', prompt: '', projectPath: projectRoots[0] ?? '', worktreeEnabled: false, worktreeName: '' });
      onSuccess(jobId);
    }, onError, { setSubmitting, setInlineError });
  }, [state, projectRoots, onSuccess, onError]);
  return (
    <form onSubmit={handleSubmit} style={SCROLLABLE_BODY_STYLE} data-testid="dispatch-form">
      <TitleField id={`${id}-title`} value={state.title} onChange={(v) => set('title', v)} />
      <PromptField id={`${id}-prompt`} value={state.prompt} onChange={(v) => set('prompt', v)} />
      <ProjectField id={`${id}-project`} roots={projectRoots} value={state.projectPath} onChange={(v) => set('projectPath', v)} />
      <WorktreeFields enabled={state.worktreeEnabled} name={state.worktreeName}
        onToggle={(v) => set('worktreeEnabled', v)} onNameChange={(v) => set('worktreeName', v)} />
      {inlineError && (
        <p role="alert" style={{ ...ERROR_TEXT_STYLE, color: 'var(--status-error)' }}>{inlineError}</p>
      )}
      <SubmitArea submitting={submitting} onCancelSubmit={() => setSubmitting(false)} />
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
