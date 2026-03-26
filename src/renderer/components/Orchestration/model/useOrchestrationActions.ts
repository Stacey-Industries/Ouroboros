import { useCallback } from 'react';

import type {
  TaskMutationResult,
  TaskSessionRecord,
  TaskSessionResult,
  VerificationResult,
} from '../../../types/electron';
import {
  applyMutationResult,
  deriveStateFromSession,
  hasElectronAPI,
  mergeSession,
  normalizeError,
  type OrchestrationStateStore,
  sessionMatchesProjectRoot,
} from '../useOrchestrationModel.helpers';
import {
  resolveTaskId,
  useRerunVerificationAction,
  useResumeLatestAction,
  useTaskMutationAction,
} from './useOrchestrationActions.parts';

interface ActionArgs {
  latestSession: TaskSessionRecord | null;
  session: TaskSessionRecord | null;
  activeTaskId?: string;
}

type MutationResult = TaskMutationResult | VerificationResult | TaskSessionResult;

type MutationRunner = () => Promise<MutationResult>;

function useActionRunner(setters: OrchestrationStateStore): (message: string, fallback: string, run: MutationRunner) => Promise<boolean> {
  return useCallback(async (message: string, fallback: string, run: MutationRunner): Promise<boolean> => {
    setters.setActionError(null);
    setters.setActionMessage(message);

    try {
      const response = await run();
      if (!response.success) {
        setters.setActionError(response.error ?? fallback);
        return false;
      }

      applyMutationResult(response, setters);
      return true;
    } catch (nextError) {
      setters.setActionError(normalizeError(nextError, fallback));
      return false;
    }
  }, [setters]);
}

export function useSessionSelection(projectRoot: string | null, setters: OrchestrationStateStore): (sessionId: string) => Promise<void> {
  return useCallback(async (sessionId: string): Promise<void> => {
    setters.setSelectedSessionId(sessionId);

    if (!hasElectronAPI()) {
      return;
    }

    try {
      const response = await window.electronAPI.orchestration.loadSession(sessionId);
      if (response.success && response.session && sessionMatchesProjectRoot(response.session, projectRoot)) {
        setters.setSessions((previous) => mergeSession(previous, response.session!));
        setters.setState(deriveStateFromSession(response.session));
        setters.setLatestVerificationSummary(response.session.lastVerificationSummary ?? response.session.latestResult?.verificationSummary ?? null);
        setters.setLatestResult(response.session.latestResult ?? null);
      }
    } catch {
      return;
    }
  }, [projectRoot, setters]);
}

export function useTaskControlActions(setters: OrchestrationStateStore, args: ActionArgs) {
  const runAction = useActionRunner(setters);
  const latestSession = args.latestSession;
  const session = args.session;
  const taskId = resolveTaskId(args.activeTaskId, args.latestSession);
  const resumeLatest = useResumeLatestAction(setters, runAction, latestSession);
  const rerunVerification = useRerunVerificationAction(setters, runAction, session);
  const pauseActive = useTaskMutationAction(setters, runAction, taskId, 'pause');
  const cancelActive = useTaskMutationAction(setters, runAction, taskId, 'cancel');

  return { resumeLatest, rerunVerification, pauseActive, cancelActive };
}
