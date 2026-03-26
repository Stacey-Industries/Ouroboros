import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskSessionRecord, VerificationSummary } from '../types/electron';
import {
  OPEN_ORCHESTRATION_PANEL_EVENT,
  OPEN_ORCHESTRATION_SESSION_EVENT,
} from './appEventNames';
import {
  rerunLatestOrchestrationVerification,
  resolveOrchestrationWorkspaceRoot,
  resumeLatestOrchestrationTask,
} from './orchestrationCommandHelpers';

const CustomEventImpl = globalThis.CustomEvent ?? class<T = unknown> extends Event {
  detail: T;

  constructor(type: string, init?: CustomEventInit<T>) {
    super(type);
    this.detail = init?.detail as T;
  }
};

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
      goal: 'Ship orchestration smoke coverage',
      mode: 'edit',
      provider: 'claude-code',
      verificationProfile: 'default',
      metadata: {
        origin: 'panel',
        label: 'Renderer smoke',
      },
    },
    status: 'idle',
    attempts: [],
    unresolvedIssues: [],
    ...overrides,
  };
}

describe('orchestrationCommandHelpers', () => {
  const toast = vi.fn(() => 'toast-id');
  const dispatchEvent = vi.fn();
  const loadLatestSession = vi.fn();
  const resumeTask = vi.fn();
  const rerunVerification = vi.fn();

  beforeEach(() => {
    toast.mockReset();
    dispatchEvent.mockReset();
    loadLatestSession.mockReset();
    resumeTask.mockReset();
    rerunVerification.mockReset();

    vi.stubGlobal('CustomEvent', CustomEventImpl as typeof CustomEvent);
    vi.stubGlobal('window', {
      dispatchEvent,
      electronAPI: {
        orchestration: {
          loadLatestSession,
          resumeTask,
          rerunVerification,
        },
      },
    });
  });

  it('prefers the command detail workspace root when provided', () => {
    expect(resolveOrchestrationWorkspaceRoot('C:\\repo', { workspaceRoot: 'D:\\other' })).toBe('D:\\other');
    expect(resolveOrchestrationWorkspaceRoot('C:\\repo')).toBe('C:\\repo');
  });

  it('resumes the latest orchestration task and emits open-session events', async () => {
    const session = createSession();
    loadLatestSession.mockResolvedValue({ success: true, session });
    resumeTask.mockResolvedValue({ success: true, session });

    await resumeLatestOrchestrationTask({
      projectRoot: 'C:\\repo',
      toast,
    });

    expect(loadLatestSession).toHaveBeenCalledWith('C:\\repo');
    expect(resumeTask).toHaveBeenCalledWith('session-1');
    expect(toast).toHaveBeenCalledWith(
      'Resumed latest orchestration task.',
      'success',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Open' }),
      }),
    );

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: OPEN_ORCHESTRATION_PANEL_EVENT }));
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: OPEN_ORCHESTRATION_SESSION_EVENT,
      detail: { sessionId: 'session-1' },
    }));
  });

  it('warns when there is no active project root to resume from', async () => {
    await resumeLatestOrchestrationTask({
      projectRoot: null,
      toast,
    });

    expect(loadLatestSession).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Open a project before resuming orchestration.', 'warning');
  });

  it('reruns verification and reports the summary using the session label', async () => {
    const session = createSession();
    const summary: VerificationSummary = {
      profile: 'default',
      status: 'failed',
      startedAt: 10,
      completedAt: 20,
      commandResults: [],
      issues: [],
      summary: 'lint failed in App.tsx',
      requiredApproval: false,
    };
    loadLatestSession.mockResolvedValue({ success: true, session });
    rerunVerification.mockResolvedValue({ success: true, session, summary });

    await rerunLatestOrchestrationVerification({
      projectRoot: 'C:\\repo',
      toast,
    });

    expect(rerunVerification).toHaveBeenCalledWith('session-1', 'default');
    expect(toast).toHaveBeenCalledWith(
      'Verification rerun finished for Renderer smoke: lint failed in App.tsx',
      'warning',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Open' }),
      }),
    );
  });
});
