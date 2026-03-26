import { useCallback, useMemo, useState } from 'react';

import type {
  ContextPacket,
  ContextPacketResult,
  OrchestrationMode,
  OrchestrationProvider,
  TaskMutationResult,
  TaskRequest,
  VerificationProfileName,
} from '../../types/electron';
import { type ContextSelectionModel,useContextSelectionModel } from '../ContextBuilder/useContextSelectionModel';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && 'orchestration' in window.electronAPI;
}

function toPreviewPacket(packet: ContextPacket | null): Pick<ContextPacket, 'budget' | 'files' | 'omittedCandidates'> | null {
  if (!packet) {
    return null;
  }

  return {
    budget: packet.budget,
    files: packet.files,
    omittedCandidates: packet.omittedCandidates,
  };
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildTaskRequest(args: {
  goal: string;
  mode: OrchestrationMode;
  projectRoot: string;
  provider: OrchestrationProvider;
  selection: ContextSelectionModel['selection'];
  verificationProfile: VerificationProfileName;
}): TaskRequest {
  return {
    workspaceRoots: [args.projectRoot],
    goal: args.goal.trim(),
    mode: args.mode,
    provider: args.provider,
    verificationProfile: args.verificationProfile,
    contextSelection: args.selection,
    metadata: {
      origin: 'panel',
      label: 'Orchestration Panel',
    },
  };
}

function resolveTaskId(result: TaskMutationResult): string | null {
  return result.taskId ?? result.session?.taskId ?? null;
}

function resolveSessionId(result: TaskMutationResult, fallbackSessionId: string | null): string | null {
  return result.session?.id ?? fallbackSessionId;
}

async function buildContextPreview(request: TaskRequest): Promise<ContextPacketResult> {
  return window.electronAPI.orchestration.previewContext(request);
}

async function createTask(request: TaskRequest): Promise<TaskMutationResult> {
  return window.electronAPI.orchestration.createTask(request);
}

async function startTask(taskId: string): Promise<TaskMutationResult> {
  return window.electronAPI.orchestration.startTask(taskId);
}

function handleCreateTaskFailure(
  createResult: TaskMutationResult,
  state: ReturnType<typeof useComposerState>,
): string | null {
  if (!createResult.success) {
    state.setError(createResult.error ?? 'Unable to create orchestration task.');
    return null;
  }

  const taskId = resolveTaskId(createResult);
  if (!taskId) {
    state.setError('The orchestration task was created without a task ID.');
    return null;
  }

  return taskId;
}

async function handleStartTaskResult(args: {
  createResult: TaskMutationResult;
  onTaskReady: OrchestrationTaskComposerModelArgs['onTaskReady'];
  startResult: TaskMutationResult;
  state: ReturnType<typeof useComposerState>;
}): Promise<void> {
  const sessionId = resolveSessionId(args.startResult, args.createResult.session?.id ?? null);
  if (sessionId) {
    await args.onTaskReady(sessionId);
  }
  if (!args.startResult.success) {
    args.state.setError(args.startResult.error ?? 'Unable to start orchestration task.');
    return;
  }

  args.state.setPreviewPacket(toPreviewPacket(args.startResult.session?.contextPacket ?? null));
  args.state.setStatus('Orchestration task started. Review the session tabs for provider progress and verification results.');
}

function useComposerState() {
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState<OrchestrationMode>('edit');
  const [provider, setProvider] = useState<OrchestrationProvider>('claude-code');
  const [verificationProfile, setVerificationProfile] = useState<VerificationProfileName>('default');
  const [previewPacket, setPreviewPacket] = useState<Pick<ContextPacket, 'budget' | 'files' | 'omittedCandidates'> | null>(null);
  const [status, setStatus] = useState<string | null>('Preview and launch a narrow orchestration task from this panel.');
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  return {
    error,
    goal,
    mode,
    previewPacket,
    previewing,
    provider,
    setError,
    setGoal,
    setMode,
    setPreviewPacket,
    setPreviewing,
    setProvider,
    setStarting,
    setStatus,
    setVerificationProfile,
    starting,
    status,
    verificationProfile,
  };
}

function useComposerRequest(
  projectRoot: string,
  selection: ContextSelectionModel['selection'],
  state: ReturnType<typeof useComposerState>,
): TaskRequest {
  return useMemo(() => buildTaskRequest({
    goal: state.goal,
    mode: state.mode,
    projectRoot,
    provider: state.provider,
    selection,
    verificationProfile: state.verificationProfile,
  }), [projectRoot, selection, state.goal, state.mode, state.provider, state.verificationProfile]);
}

function buildComposerModel(args: {
  canSubmit: boolean;
  contextSelection: ContextSelectionModel;
  handlePreview: () => Promise<void>;
  handleStart: () => Promise<void>;
  projectRoot: string;
  state: ReturnType<typeof useComposerState>;
}): OrchestrationTaskComposerModel {
  return {
    canSubmit: args.canSubmit,
    contextSelection: args.contextSelection,
    error: args.state.error,
    goal: args.state.goal,
    mode: args.state.mode,
    previewing: args.state.previewing,
    projectRootLabel: args.projectRoot.replace(/\\/g, '/'),
    provider: args.state.provider,
    starting: args.state.starting,
    status: args.state.status,
    verificationProfile: args.state.verificationProfile,
    setGoal: args.state.setGoal,
    setMode: args.state.setMode,
    setProvider: args.state.setProvider,
    setVerificationProfile: args.state.setVerificationProfile,
    handlePreview: args.handlePreview,
    handleStart: args.handleStart,
  };
}

function useComposerPreviewAction(
  request: TaskRequest,
  state: ReturnType<typeof useComposerState>,
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (!hasElectronAPI() || !request.goal) {
      return;
    }

    state.setPreviewing(true);
    state.setError(null);
    state.setStatus('Building orchestration context preview...');
    try {
      const result = await buildContextPreview(request);
      if (!result.success || !result.packet) {
        state.setError(result.error ?? 'Unable to build orchestration context preview.');
        return;
      }
      state.setPreviewPacket(toPreviewPacket(result.packet));
      state.setStatus(`Context preview ready with ${result.packet.files.length} ranked files.`);
    } catch (nextError) {
      state.setError(normalizeError(nextError));
    } finally {
      state.setPreviewing(false);
    }
  }, [request, state]);
}

async function performComposerStartAction(args: {
  onTaskReady: OrchestrationTaskComposerModelArgs['onTaskReady'];
  request: TaskRequest;
  state: ReturnType<typeof useComposerState>;
}): Promise<void> {
  const createResult = await createTask(args.request);
  const taskId = handleCreateTaskFailure(createResult, args.state);
  if (!taskId) {
    return;
  }

  args.state.setStatus('Submitting orchestration task to the provider...');
  const startResult = await startTask(taskId);
  await handleStartTaskResult({ createResult, onTaskReady: args.onTaskReady, startResult, state: args.state });
}

function useComposerStartAction(
  args: OrchestrationTaskComposerModelArgs,
  request: TaskRequest,
  state: ReturnType<typeof useComposerState>,
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (!hasElectronAPI() || !request.goal) {
      return;
    }

    state.setStarting(true);
    state.setError(null);
    state.setStatus('Creating orchestration task...');
    try {
      await performComposerStartAction({ onTaskReady: args.onTaskReady, request, state });
    } catch (nextError) {
      state.setError(normalizeError(nextError));
    } finally {
      state.setStarting(false);
    }
  }, [args, request, state]);
}

export interface OrchestrationTaskComposerModel {
  canSubmit: boolean;
  contextSelection: ContextSelectionModel;
  error: string | null;
  goal: string;
  mode: OrchestrationMode;
  previewing: boolean;
  projectRootLabel: string;
  provider: OrchestrationProvider;
  starting: boolean;
  status: string | null;
  verificationProfile: VerificationProfileName;
  setGoal: (value: string) => void;
  setMode: (value: OrchestrationMode) => void;
  setProvider: (value: OrchestrationProvider) => void;
  setVerificationProfile: (value: VerificationProfileName) => void;
  handlePreview: () => Promise<void>;
  handleStart: () => Promise<void>;
}

export interface OrchestrationTaskComposerModelArgs {
  onTaskReady: (sessionId: string) => Promise<void> | void;
  projectRoot: string;
}

export function useOrchestrationTaskComposerModel(
  args: OrchestrationTaskComposerModelArgs,
): OrchestrationTaskComposerModel {
  const state = useComposerState();
  const contextSelection = useContextSelectionModel({ previewPacket: state.previewPacket });
  const request = useComposerRequest(args.projectRoot, contextSelection.selection, state);
  const canSubmit = request.goal.length > 0 && !state.previewing && !state.starting;
  const handlePreview = useComposerPreviewAction(request, state);
  const handleStart = useComposerStartAction(args, request, state);

  return buildComposerModel({ canSubmit, contextSelection, handlePreview, handleStart, projectRoot: args.projectRoot, state });
}
