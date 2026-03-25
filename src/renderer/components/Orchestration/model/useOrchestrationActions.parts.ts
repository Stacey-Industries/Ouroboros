import { useCallback } from 'react';
import type {
  TaskMutationResult,
  TaskSessionRecord,
  TaskSessionResult,
  VerificationResult,
} from '../../../types/electron';
import { hasElectronAPI, type OrchestrationStateStore } from '../useOrchestrationModel.helpers';

interface ActionConfig {
  fallback: string;
  pendingMessage: string;
  successMessage: string;
}

type MutationRunner = () => Promise<TaskMutationResult | VerificationResult | TaskSessionResult>;

export function runTaskAction(
  setters: OrchestrationStateStore,
  runAction: (message: string, fallback: string, run: MutationRunner) => Promise<boolean>,
  config: ActionConfig,
  run: MutationRunner | null,
): Promise<boolean> {
  if (!run || !hasElectronAPI()) {
    return Promise.resolve(false);
  }

  return runAction(config.pendingMessage, config.fallback, run).then((ok) => {
    if (ok) {
      setters.setActionMessage(config.successMessage);
    }

    return ok;
  });
}

export function useResumeLatestAction(
  setters: OrchestrationStateStore,
  runAction: (message: string, fallback: string, run: MutationRunner) => Promise<boolean>,
  latestSession: TaskSessionRecord | null,
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    await runTaskAction(
      setters,
      runAction,
      {
        pendingMessage: 'Resuming orchestration task...',
        fallback: 'Unable to resume orchestration task.',
        successMessage: 'Orchestration task resumed.',
      },
      latestSession ? () => window.electronAPI.orchestration.resumeTask(latestSession.id) : null,
    );
  }, [latestSession, runAction, setters]);
}

export function useRerunVerificationAction(
  setters: OrchestrationStateStore,
  runAction: (message: string, fallback: string, run: MutationRunner) => Promise<boolean>,
  session: TaskSessionRecord | null,
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    await runTaskAction(
      setters,
      runAction,
      {
        pendingMessage: 'Rerunning verification...',
        fallback: 'Unable to rerun verification.',
        successMessage: 'Verification rerun requested.',
      },
      session ? () => window.electronAPI.orchestration.rerunVerification(session.id, session.request.verificationProfile) : null,
    );
  }, [runAction, session, setters]);
}

export function useTaskMutationAction(
  setters: OrchestrationStateStore,
  runAction: (message: string, fallback: string, run: MutationRunner) => Promise<boolean>,
  taskId: string | undefined,
  mode: 'pause' | 'cancel',
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    const config = mode === 'pause'
      ? {
        pendingMessage: 'Pausing orchestration task...',
        fallback: 'Unable to pause orchestration task.',
        successMessage: 'Orchestration task paused.',
      }
      : {
        pendingMessage: 'Cancelling orchestration task...',
        fallback: 'Unable to cancel orchestration task.',
        successMessage: 'Orchestration task cancelled.',
      };
    const run = !taskId
      ? null
      : mode === 'pause'
        ? () => window.electronAPI.orchestration.pauseTask(taskId)
        : () => window.electronAPI.orchestration.cancelTask(taskId);
    await runTaskAction(setters, runAction, config, run);
  }, [mode, runAction, setters, taskId]);
}

export function resolveTaskId(activeTaskId: string | undefined, latestSession: TaskSessionRecord | null): string | undefined {
  return activeTaskId ?? latestSession?.taskId;
}
