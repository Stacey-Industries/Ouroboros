import type {
  OrchestrationState,
  ProviderProgressEvent,
  TaskResult,
  TaskSessionRecord,
  VerificationSummary,
} from '../types/electron';
import type { ToastFn } from './orchestrationCommandHelpers';
import {
  announceProviderSession,
  createOrchestrationActionOptions,
  getResultToastPayload,
  getStateToastPayload,
  getVerificationToastPayload,
  hasElectronAPI,
  notifyDesktop,
} from './orchestrationUiHelpers';

interface SubscriptionArgs {
  toast: ToastFn;
  seenProviderSessions: Set<string>;
  seenResults: Set<string>;
  seenStates: Set<string>;
  seenVerifications: Set<string>;
}

function createStateKey(state: OrchestrationState): string {
  return [state.activeTaskId, state.activeSessionId, state.status, state.message].join(':');
}

function createVerificationKey(summary: VerificationSummary): string {
  return [summary.profile, summary.status, summary.startedAt, summary.completedAt, summary.summary].join(':');
}

function createResultKey(result: TaskResult): string {
  return [result.taskId, result.sessionId, result.attemptId, result.status, result.message].join(':');
}

function handleStateEvent(state: OrchestrationState, args: SubscriptionArgs): void {
  const key = createStateKey(state);
  if (args.seenStates.has(key)) {
    return;
  }
  args.seenStates.add(key);

  const payload = getStateToastPayload(state);
  if (!payload) {
    return;
  }

  args.toast(
    payload.message,
    payload.type,
    createOrchestrationActionOptions(state.activeSessionId, payload.duration),
  );

  if (payload.notify) {
    notifyDesktop('Orchestration update', payload.message);
  }
}

function handleProviderEvent(event: ProviderProgressEvent, args: SubscriptionArgs): void {
  announceProviderSession({
    provider: event.provider,
    seenKeys: args.seenProviderSessions,
    session: event.session,
  });

  if (event.status !== 'failed') {
    return;
  }

  const message = event.message?.trim()
    ? `Provider error: ${event.message.trim()}`
    : 'The orchestration provider reported an error.';
  args.toast(message, 'error', { duration: 7000 });
  notifyDesktop('Orchestration provider error', message);
}

function handleVerificationEvent(summary: VerificationSummary, args: SubscriptionArgs): void {
  const key = createVerificationKey(summary);
  if (args.seenVerifications.has(key)) {
    return;
  }
  args.seenVerifications.add(key);

  const payload = getVerificationToastPayload(summary);
  if (!payload) {
    return;
  }

  args.toast(payload.message, payload.type, { duration: payload.duration });
  if (payload.notify) {
    notifyDesktop('Orchestration verification', payload.message);
  }
}

function handleSessionEvent(session: TaskSessionRecord, args: SubscriptionArgs): void {
  announceProviderSession({
    orchestrationSessionId: session.id,
    provider: session.providerSession?.provider ?? session.request.provider,
    seenKeys: args.seenProviderSessions,
    session: session.providerSession,
    taskId: session.taskId,
  });
}

function handleResultEvent(result: TaskResult, args: SubscriptionArgs): void {
  const key = createResultKey(result);
  if (args.seenResults.has(key)) {
    return;
  }
  args.seenResults.add(key);

  announceProviderSession({
    orchestrationSessionId: result.sessionId,
    provider: result.providerArtifact?.session.provider ?? result.providerArtifact?.provider ?? 'unknown',
    seenKeys: args.seenProviderSessions,
    session: result.providerArtifact?.session,
    taskId: result.taskId,
  });

  const payload = getResultToastPayload(result);
  if (!payload) return;

  args.toast(
    payload.message,
    payload.type,
    createOrchestrationActionOptions(result.sessionId, payload.duration),
  );

  if (payload.notify) {
    notifyDesktop('Orchestration result', payload.message);
  }
}

export function subscribeToOrchestrationUiEvents(args: SubscriptionArgs): (() => void) | undefined {
  if (!hasElectronAPI()) {
    return undefined;
  }

  const stopState = window.electronAPI.orchestration.onStateChange((state) => {
    handleStateEvent(state, args);
  });
  const stopProvider = window.electronAPI.orchestration.onProviderEvent((event) => {
    handleProviderEvent(event, args);
  });
  const stopVerification = window.electronAPI.orchestration.onVerificationSummary((summary) => {
    handleVerificationEvent(summary, args);
  });
  const stopSession = window.electronAPI.orchestration.onSessionUpdate((session) => {
    handleSessionEvent(session, args);
  });
  const stopResult = window.electronAPI.orchestration.onTaskResult((result) => {
    handleResultEvent(result, args);
  });

  return () => {
    stopState();
    stopProvider();
    stopVerification();
    stopSession();
    stopResult();
  };
}
