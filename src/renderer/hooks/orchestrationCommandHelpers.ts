import type { TaskSessionRecord } from '../types/electron';
import {
  createOrchestrationActionOptions,
  emitOrchestrationOpen,
  hasElectronAPI,
} from './orchestrationUiHelpers';
import type { ToastOptions, ToastType } from './useToast';

export interface OrchestrationCommandDetail {
  workspaceRoot?: string;
}

export type ToastFn = (message: string, type?: ToastType, options?: ToastOptions) => string;

export function resolveOrchestrationWorkspaceRoot(
  projectRoot: string | null,
  detail?: OrchestrationCommandDetail,
): string | null {
  return detail?.workspaceRoot ?? projectRoot;
}

export async function loadLatestOrchestrationSession(
  workspaceRoot: string,
): Promise<TaskSessionRecord | null> {
  const result = await window.electronAPI.orchestration.loadLatestSession(workspaceRoot);
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to load the latest orchestration session');
  }
  return result.session ?? null;
}

async function loadLatestSessionForCommand(args: {
  detail?: OrchestrationCommandDetail;
  loadErrorPrefix: string;
  missingProjectMessage: string;
  missingSessionMessage: string;
  projectRoot: string | null;
  toast: ToastFn;
}): Promise<TaskSessionRecord | null> {
  const workspaceRoot = resolveOrchestrationWorkspaceRoot(args.projectRoot, args.detail);
  if (!workspaceRoot) {
    args.toast(args.missingProjectMessage, 'warning');
    return null;
  }

  try {
    const latestSession = await loadLatestOrchestrationSession(workspaceRoot);
    if (latestSession) {
      return latestSession;
    }

    args.toast(args.missingSessionMessage, 'info');
    return null;
  } catch (error) {
    args.toast(`${args.loadErrorPrefix}: ${error instanceof Error ? error.message : String(error)}`, 'error', {
      duration: 7000,
    });
    return null;
  }
}

function buildVerificationToastMessage(session: TaskSessionRecord, summaryText?: string): string {
  const label = session.request.metadata?.label?.trim() || session.request.goal.trim();
  const subject = label ? ` for ${label}` : '';
  return summaryText?.trim()
    ? `Verification rerun finished${subject}: ${summaryText.trim()}`
    : `Verification rerun finished${subject}.`;
}

function getVerificationToastType(status?: string): 'warning' | 'success' | 'info' {
  if (status === 'failed') return 'warning';
  if (status === 'passed') return 'success';
  return 'info';
}

function notifyVerificationRerunSuccess(
  args: { toast: ToastFn },
  latestSession: TaskSessionRecord,
  result: {
    session?: TaskSessionRecord;
    summary?: { status?: string; summary?: string };
  },
): void {
  const sessionId = result.session?.id ?? latestSession.id;
  emitOrchestrationOpen(sessionId);
  args.toast(
    buildVerificationToastMessage(result.session ?? latestSession, result.summary?.summary),
    getVerificationToastType(result.summary?.status),
    createOrchestrationActionOptions(sessionId),
  );
}

export async function resumeLatestOrchestrationTask(args: {
  detail?: OrchestrationCommandDetail;
  projectRoot: string | null;
  toast: ToastFn;
}): Promise<void> {
  if (!hasElectronAPI()) return;
  const latestSession = await loadLatestSessionForCommand({
    detail: args.detail,
    loadErrorPrefix: 'Unable to resume orchestration',
    missingProjectMessage: 'Open a project before resuming orchestration.',
    missingSessionMessage: 'No orchestration task exists for this project yet.',
    projectRoot: args.projectRoot,
    toast: args.toast,
  });
  if (!latestSession) return;

  try {
    emitOrchestrationOpen(latestSession.id);
    const result = await window.electronAPI.orchestration.resumeTask(latestSession.id);
    if (!result.success) {
      args.toast(`Unable to resume orchestration: ${result.error ?? 'unknown error'}`, 'error', { duration: 7000 });
      return;
    }

    const sessionId = result.session?.id ?? latestSession.id;
    emitOrchestrationOpen(sessionId);
    args.toast('Resumed latest orchestration task.', 'success', createOrchestrationActionOptions(sessionId));
  } catch (error) {
    args.toast(`Unable to resume orchestration: ${error instanceof Error ? error.message : String(error)}`, 'error', { duration: 7000 });
  }
}

export async function rerunLatestOrchestrationVerification(args: {
  detail?: OrchestrationCommandDetail;
  projectRoot: string | null;
  toast: ToastFn;
}): Promise<void> {
  if (!hasElectronAPI()) return;
  const latestSession = await loadLatestSessionForCommand({
    detail: args.detail,
    loadErrorPrefix: 'Unable to rerun orchestration verification',
    missingProjectMessage: 'Open a project before rerunning orchestration verification.',
    missingSessionMessage: 'No orchestration task exists for this project yet.',
    projectRoot: args.projectRoot,
    toast: args.toast,
  });
  if (!latestSession) return;

  try {
    emitOrchestrationOpen(latestSession.id);
    const result = await window.electronAPI.orchestration.rerunVerification(
      latestSession.id,
      latestSession.request.verificationProfile,
    );
    if (!result.success) {
      args.toast(`Unable to rerun orchestration verification: ${result.error ?? 'unknown error'}`, 'error', { duration: 7000 });
      return;
    }

    notifyVerificationRerunSuccess(args, latestSession, result);
  } catch (error) {
    args.toast(`Unable to rerun orchestration verification: ${error instanceof Error ? error.message : String(error)}`, 'error', {
      duration: 7000,
    });
  }
}
