/**
 * DispatchForm.logic.ts — state and submit logic for the dispatch form.
 *
 * Split from DispatchForm.tsx to keep the component shell under the ESLint
 * max-lines and max-lines-per-function limits.
 */

import { type FormEvent,useCallback, useEffect, useId, useState } from 'react';

import { enqueueOfflineDispatch, listOfflineDispatches } from '../../../web/offlineDispatchQueue';
import type { DispatchRequest } from '../../types/electron-dispatch';

export interface FormState {
  title: string;
  prompt: string;
  projectPath: string;
  worktreeEnabled: boolean;
  worktreeName: string;
}

export interface DispatchFormModel {
  id: string;
  state: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  submitting: boolean;
  queued: boolean;
  inlineError: string | null;
  offlineCount: number;
  isOffline: boolean;
  cancelSubmit: () => void;
  handleSubmit: (e: FormEvent) => void;
}

interface SubmitSetters {
  setSubmitting: (v: boolean) => void;
  setInlineError: (v: string | null) => void;
}

function getDefaultFormState(projectRoots: string[]): FormState {
  return {
    title: '',
    prompt: '',
    projectPath: projectRoots[0] ?? '',
    worktreeEnabled: false,
    worktreeName: '',
  };
}

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

async function submitOnline(
  request: DispatchRequest,
  onSuccess: (jobId: string) => void,
  onError: (msg: string) => void,
  setters: SubmitSetters,
): Promise<void> {
  const api = window.electronAPI?.sessions;
  if (!api?.dispatchTask) {
    onError('Dispatch API unavailable.');
    return;
  }
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
  setInlineError(null);
}

function useOfflineDispatchCount(
  connState: string,
  setOfflineCount: (v: number) => void,
): void {
  useEffect(() => {
    void listOfflineDispatches().then((q) => setOfflineCount(q.length));
  }, [connState, setOfflineCount]);
}

interface SubmitDispatchArgs extends SubmitSetters {
  state: FormState;
  isOffline: boolean;
  resetForm: () => void;
  onSuccess: (jobId: string) => void;
  onError: (msg: string) => void;
  setQueued: (v: boolean) => void;
  setOfflineCount: (v: number) => void;
}

async function submitDispatchForm({
  state,
  isOffline,
  resetForm,
  onSuccess,
  onError,
  setSubmitting,
  setInlineError,
  setQueued,
  setOfflineCount,
}: SubmitDispatchArgs): Promise<void> {
  setQueued(false);
  const validationError = validate(state);
  if (validationError) {
    setInlineError(validationError);
    return;
  }
  const request = buildRequest(state);
  if (isOffline) {
    await submitOffline(request, setInlineError, setQueued, resetForm);
    void listOfflineDispatches().then((q) => setOfflineCount(q.length));
    return;
  }
  await submitOnline(
    request,
    (jobId) => {
      resetForm();
      onSuccess(jobId);
    },
    onError,
    { setSubmitting, setInlineError },
  );
}

function useDispatchFormSubmit({
  state,
  isOffline,
  resetForm,
  onSuccess,
  onError,
  setSubmitting,
  setInlineError,
  setQueued,
  setOfflineCount,
}: SubmitDispatchArgs): (e: FormEvent) => void {
  return useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void submitDispatchForm({
        state,
        isOffline,
        resetForm,
        onSuccess,
        onError,
        setSubmitting,
        setInlineError,
        setQueued,
        setOfflineCount,
      });
    },
    [state, isOffline, resetForm, onSuccess, onError, setSubmitting, setInlineError, setQueued, setOfflineCount],
  );
}

export function useDispatchFormModel(
  projectRoots: string[],
  connState: string,
  onSuccess: (jobId: string) => void,
  onError: (msg: string) => void,
): DispatchFormModel {
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [state, setState] = useState<FormState>(() => getDefaultFormState(projectRoots));
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);
  useOfflineDispatchCount(connState, setOfflineCount);
  const handleSubmit = useDispatchFormSubmit({
    state,
    isOffline: connState !== 'connected' && connState !== 'electron',
    resetForm: () => setState(getDefaultFormState(projectRoots)),
    onSuccess,
    onError,
    setSubmitting,
    setInlineError,
    setQueued,
    setOfflineCount,
  });
  return {
    id,
    state,
    set,
    submitting,
    queued,
    inlineError,
    offlineCount,
    isOffline: connState !== 'connected' && connState !== 'electron',
    cancelSubmit: () => setSubmitting(false),
    handleSubmit,
  };
}
