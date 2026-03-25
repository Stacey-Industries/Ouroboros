import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OrchestrationState,
  ProviderProgressEvent,
  TaskResult,
  TaskSessionRecord,
  VerificationSummary,
} from '../types/electron';
import { subscribeToOrchestrationUiEvents } from './orchestrationEventSubscriptions';
import { ORCHESTRATION_PROVIDER_SESSION_EVENT } from './appEventNames';

const CustomEventImpl = globalThis.CustomEvent ?? class<T = unknown> extends Event {
  detail: T;

  constructor(type: string, init?: CustomEventInit<T>) {
    super(type);
    this.detail = init?.detail as T;
  }
};

function createState(overrides: Partial<OrchestrationState> = {}): OrchestrationState {
  return {
    status: 'failed',
    activeTaskId: 'task-1',
    activeSessionId: 'session-1',
    message: 'formatter crashed',
    updatedAt: 10,
    ...overrides,
  };
}

function createVerificationSummary(overrides: Partial<VerificationSummary> = {}): VerificationSummary {
  return {
    profile: 'default',
    status: 'failed',
    startedAt: 1,
    completedAt: 2,
    commandResults: [],
    issues: [],
    summary: 'lint failed',
    requiredApproval: false,
    ...overrides,
  };
}

function createResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-1',
    sessionId: 'session-1',
    status: 'complete',
    unresolvedIssues: [],
    message: 'Task complete.',
    ...overrides,
  };
}

function createSession(overrides: Partial<TaskSessionRecord> = {}): TaskSessionRecord {
  return {
    version: 1,
    id: 'session-1',
    taskId: 'task-1',
    workspaceRoots: ['C:\\repo'],
    createdAt: 1,
    updatedAt: 2,
    request: {
      workspaceRoots: ['C:\\repo'],
      goal: 'Smoke test orchestration panel',
      mode: 'edit',
      provider: 'claude-code',
      verificationProfile: 'default',
      metadata: { origin: 'panel', label: 'Smoke test' },
    },
    status: 'idle',
    attempts: [],
    unresolvedIssues: [],
    ...overrides,
  };
}

describe('subscribeToOrchestrationUiEvents', () => {
  const toast = vi.fn();
  const notify = vi.fn().mockResolvedValue(undefined);
  const dispatchEvent = vi.fn();
  let stateCallback: ((state: OrchestrationState) => void) | undefined;
  let providerCallback: ((event: ProviderProgressEvent) => void) | undefined;
  let verificationCallback: ((summary: VerificationSummary) => void) | undefined;
  let sessionCallback: ((session: TaskSessionRecord) => void) | undefined;
  let resultCallback: ((result: TaskResult) => void) | undefined;

  beforeEach(() => {
    toast.mockReset();
    notify.mockClear();
    dispatchEvent.mockReset();
    stateCallback = undefined;
    providerCallback = undefined;
    verificationCallback = undefined;
    sessionCallback = undefined;
    resultCallback = undefined;

    vi.stubGlobal('CustomEvent', CustomEventImpl as typeof CustomEvent);
    vi.stubGlobal('window', {
      dispatchEvent,
      electronAPI: {
        app: {
          notify,
        },
        orchestration: {
          onStateChange: (callback: (state: OrchestrationState) => void) => {
            stateCallback = callback;
            return () => undefined;
          },
          onProviderEvent: (callback: (event: ProviderProgressEvent) => void) => {
            providerCallback = callback;
            return () => undefined;
          },
          onVerificationSummary: (callback: (summary: VerificationSummary) => void) => {
            verificationCallback = callback;
            return () => undefined;
          },
          onSessionUpdate: (callback: (session: TaskSessionRecord) => void) => {
            sessionCallback = callback;
            return () => undefined;
          },
          onTaskResult: (callback: (result: TaskResult) => void) => {
            resultCallback = callback;
            return () => undefined;
          },
        },
      },
    });
  });

  it('shows a deduplicated failure toast for state updates and notifies the desktop', async () => {
    subscribeToOrchestrationUiEvents({
      toast,
      seenProviderSessions: new Set(),
      seenResults: new Set(),
      seenStates: new Set(),
      seenVerifications: new Set(),
    });

    const state = createState();
    stateCallback?.(state);
    stateCallback?.(state);

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      'Orchestration failed: formatter crashed',
      'error',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Open' }),
      }),
    );
    expect(notify).toHaveBeenCalledWith({ title: 'Orchestration update', body: 'Orchestration failed: formatter crashed' });
  });

  it('surfaces provider failures and announces provider sessions only once', () => {
    subscribeToOrchestrationUiEvents({
      toast,
      seenProviderSessions: new Set(),
      seenResults: new Set(),
      seenStates: new Set(),
      seenVerifications: new Set(),
    });

    const providerEvent: ProviderProgressEvent = {
      provider: 'claude-code',
      status: 'failed',
      message: 'connection dropped',
      timestamp: 1,
      session: {
        provider: 'claude-code',
        sessionId: 'provider-session-1',
      },
    };

    providerCallback?.(providerEvent);
    providerCallback?.(providerEvent);

    expect(toast).toHaveBeenCalledWith('Provider error: connection dropped', 'error', { duration: 7000 });
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: ORCHESTRATION_PROVIDER_SESSION_EVENT,
      detail: expect.objectContaining({
        provider: 'claude-code',
        session: expect.objectContaining({ sessionId: 'provider-session-1' }),
      }),
    }));
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('surfaces verification failures and completion results', () => {
    subscribeToOrchestrationUiEvents({
      toast,
      seenProviderSessions: new Set(),
      seenResults: new Set(),
      seenStates: new Set(),
      seenVerifications: new Set(),
    });

    verificationCallback?.(createVerificationSummary());
    resultCallback?.(createResult({
      message: 'Applied edits and verification passed.',
      providerArtifact: {
        provider: 'claude-code',
        status: 'completed',
        submittedAt: 1,
        session: {
          provider: 'claude-code',
          sessionId: 'provider-session-2',
        },
      },
    }));

    expect(toast).toHaveBeenCalledWith('Verification failed: lint failed', 'warning', { duration: 6000 });
    expect(toast).toHaveBeenCalledWith(
      'Applied edits and verification passed.',
      'success',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open' }) }),
    );
    expect(notify).toHaveBeenCalledWith({ title: 'Orchestration verification', body: 'Verification failed: lint failed' });
    expect(notify).toHaveBeenCalledWith({ title: 'Orchestration result', body: 'Applied edits and verification passed.' });
  });

  it('announces provider sessions attached to session updates', () => {
    subscribeToOrchestrationUiEvents({
      toast,
      seenProviderSessions: new Set(),
      seenResults: new Set(),
      seenStates: new Set(),
      seenVerifications: new Set(),
    });

    sessionCallback?.(createSession({
      providerSession: {
        provider: 'claude-code',
        sessionId: 'provider-session-3',
      },
    }));

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: ORCHESTRATION_PROVIDER_SESSION_EVENT,
      detail: expect.objectContaining({
        orchestrationSessionId: 'session-1',
        taskId: 'task-1',
      }),
    }));
  });
});
