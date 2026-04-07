import log from 'electron-log/renderer';

import type {
  OrchestrationState,
  OrchestrationStatus,
  ProviderSessionReference,
  TaskResult,
  VerificationSummary,
} from '../types/electron';
import {
  OPEN_ORCHESTRATION_PANEL_EVENT,
  OPEN_ORCHESTRATION_SESSION_EVENT,
  ORCHESTRATION_PROVIDER_SESSION_EVENT,
} from './appEventNames';
import type { ToastOptions, ToastType } from './useToast';

const STATE_MESSAGE_BUILDERS: Partial<
  Record<OrchestrationStatus, (state: OrchestrationState) => string>
> = {
  // Intermediate states (selecting_context, awaiting_provider, applying, verifying) are omitted —
  // they're too noisy when using the chat UI and visible inline in the thread.
  paused: () => 'Orchestration is paused.',
  cancelled: (state) =>
    state.message?.trim()
      ? `Orchestration cancelled: ${state.message.trim()}`
      : 'Orchestration was cancelled.',
  failed: (state) =>
    state.message?.trim()
      ? `Orchestration failed: ${state.message.trim()}`
      : 'Orchestration failed.',
  needs_review: (state) =>
    state.message?.trim()
      ? `Orchestration needs review: ${state.message.trim()}`
      : 'Orchestration needs review.',
};

const STATE_TOAST_TYPES: Partial<Record<OrchestrationStatus, ToastType>> = {
  paused: 'warning',
  cancelled: 'warning',
  failed: 'error',
  needs_review: 'warning',
};

const RESULT_MESSAGE_BUILDERS: Partial<
  Record<OrchestrationStatus, (result: TaskResult) => string>
> = {
  complete: (result) => result.message?.trim() || 'Orchestration task completed.',
  needs_review: (result) => result.message?.trim() || 'Orchestration task needs review.',
  failed: (result) =>
    result.message?.trim()
      ? `Orchestration failed: ${result.message.trim()}`
      : 'Orchestration task failed.',
  cancelled: (result) =>
    result.message?.trim()
      ? `Orchestration cancelled: ${result.message.trim()}`
      : 'Orchestration task cancelled.',
  paused: (result) =>
    result.message?.trim()
      ? `Orchestration paused: ${result.message.trim()}`
      : 'Orchestration task paused.',
};

const RESULT_TOAST_TYPES: Partial<Record<OrchestrationStatus, ToastType>> = {
  complete: 'success',
  needs_review: 'warning',
  paused: 'warning',
  cancelled: 'warning',
  failed: 'error',
};

const VERIFICATION_TOAST_TYPES: Partial<Record<VerificationSummary['status'], ToastType>> = {
  failed: 'warning',
  cancelled: 'info',
};

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function emitOrchestrationOpen(sessionId?: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_ORCHESTRATION_PANEL_EVENT));
  if (sessionId) {
    window.dispatchEvent(
      new CustomEvent(OPEN_ORCHESTRATION_SESSION_EVENT, {
        detail: { sessionId },
      }),
    );
  }
}

export function emitProviderSession(detail: {
  orchestrationSessionId?: string;
  provider: string;
  session: ProviderSessionReference;
  taskId?: string;
}): void {
  window.dispatchEvent(new CustomEvent(ORCHESTRATION_PROVIDER_SESSION_EVENT, { detail }));
}

export function notifyDesktop(title: string, body: string): void {
  if (!hasElectronAPI()) return;
  window.electronAPI.app.notify({ title, body }).catch((err: unknown) => {
    log.warn('Desktop notification failed:', err);
  });
}

export function createOrchestrationActionOptions(
  sessionId?: string,
  duration = 6000,
): ToastOptions {
  if (!sessionId) {
    return { duration };
  }

  return {
    duration,
    action: {
      label: 'Open',
      onClick: () => emitOrchestrationOpen(sessionId),
    },
  };
}

export function getProviderSessionKey(session?: ProviderSessionReference): string | null {
  if (!session) return null;
  const parts = [
    session.provider,
    session.sessionId,
    session.requestId,
    session.externalTaskId,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(':') : null;
}

export function announceProviderSession(args: {
  orchestrationSessionId?: string;
  provider: string;
  seenKeys: Set<string>;
  session?: ProviderSessionReference;
  taskId?: string;
}): void {
  const key = getProviderSessionKey(args.session);
  if (!args.session || !key || args.seenKeys.has(key)) {
    return;
  }

  args.seenKeys.add(key);
  emitProviderSession({
    orchestrationSessionId: args.orchestrationSessionId,
    provider: args.provider,
    session: args.session,
    taskId: args.taskId,
  });
}

export function getStateToastPayload(state: OrchestrationState): {
  duration: number;
  message: string;
  notify: boolean;
  type: ToastType;
} | null {
  const builder = STATE_MESSAGE_BUILDERS[state.status];
  if (!builder) {
    return null;
  }

  return {
    duration: state.status === 'failed' ? 7000 : 3000,
    message: builder(state),
    notify:
      state.status === 'failed' || state.status === 'needs_review' || state.status === 'cancelled',
    type: STATE_TOAST_TYPES[state.status] ?? 'info',
  };
}

export function getResultToastPayload(result: TaskResult): {
  duration: number;
  message: string;
  notify: boolean;
  type: ToastType;
} | null {
  const builder = RESULT_MESSAGE_BUILDERS[result.status];
  if (!builder) return null;
  return {
    duration: 7000,
    message: builder(result),
    notify:
      result.status === 'needs_review' ||
      result.status === 'failed' ||
      result.status === 'complete',
    type: RESULT_TOAST_TYPES[result.status] ?? 'info',
  };
}

export function getVerificationToastPayload(summary: VerificationSummary): {
  duration: number;
  message: string;
  notify: boolean;
  type: ToastType;
} | null {
  const type = VERIFICATION_TOAST_TYPES[summary.status];
  if (!type) {
    return null;
  }

  const detail = summary.summary?.trim();
  const message =
    summary.status === 'failed'
      ? detail
        ? `Verification failed: ${detail}`
        : 'Orchestration verification failed.'
      : detail
        ? `Verification cancelled: ${detail}`
        : 'Orchestration verification was cancelled.';

  return {
    duration: 6000,
    message,
    notify: true,
    type,
  };
}
