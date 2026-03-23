import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

import type { ImageAttachment } from '../../agentChat/types';
import {
  applyCodexPermissionModeOverride,
  buildCodexCliArgs,
  mapEffortToCodexReasoning,
} from '../../codex';
import { type CodexCliSettings, getConfigValue } from '../../config';
import log from '../../logger';
import type { ProviderCapabilities } from '../types';
import { buildPrompt } from './codexContextBuilder';
import { buildCodexEventHandler, type CodexEvent } from './codexEventHandler';
import { type CodexExecProcessHandle, spawnCodexExecProcess } from './codexExecRunner';
import {
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';

const activeProcesses = new Map<string, CodexExecProcessHandle>();
const cancelledTasks = new Set<string>();

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'codex',
    supportsStreaming: true,
    supportsResume: true,
    supportsStructuredEdits: false,
    supportsToolUse: true,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  };
}

async function materializeAttachments(
  attachments: ImageAttachment[],
): Promise<{ imagePaths: string[] }> {
  const imagePaths: string[] = [];
  for (const attachment of attachments) {
    const ext = attachment.mimeType.split('/')[1] ?? 'png';
    const tempPath = `${tmpdir()}/${randomUUID()}.${ext}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
    await writeFile(tempPath, Buffer.from(attachment.base64Data, 'base64'));
    imagePaths.push(tempPath);
  }
  return { imagePaths };
}

async function cleanupTempFiles(tempPaths: string[]): Promise<void> {
  for (const tempPath of tempPaths) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
      await unlink(tempPath);
    } catch {
      // ignore temp cleanup errors
    }
  }
}

function buildFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cleanupLaunchArtifacts(taskId: string, invocationTempPaths: string[]): void {
  activeProcesses.delete(taskId);
  void cleanupTempFiles(invocationTempPaths);
}

function resolveSettings(context: ProviderLaunchContext | ProviderResumeContext): {
  cliArgs: string[];
  model: string;
} {
  const baseSettings = getConfigValue('codexCliSettings') as CodexCliSettings;
  const permissionAdjusted = applyCodexPermissionModeOverride(
    baseSettings,
    context.request.permissionMode,
  );
  const requestReasoning = mapEffortToCodexReasoning(context.request.effort);
  const settings: CodexCliSettings = {
    ...permissionAdjusted,
    model: context.request.model || permissionAdjusted.model || '',
    reasoningEffort: requestReasoning ?? permissionAdjusted.reasoningEffort ?? '',
  };
  return { cliArgs: buildCodexCliArgs(settings, 'exec'), model: settings.model };
}

interface CodexCompletionArgs {
  taskId: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined;
  getNextBlockIndex: () => number;
  invocationTempPaths: string[];
}

function handleLaunchSuccess(
  result: { threadId: string | null; durationMs: number } | null,
  args: CodexCompletionArgs,
): void {
  cleanupLaunchArtifacts(args.taskId, args.invocationTempPaths);
  if (!result) {
    args.sink.emit({
      provider: 'codex',
      status: 'cancelled',
      message: 'Task cancelled by user',
      timestamp: Date.now(),
      session: args.sessionRef,
    });
    return;
  }
  if (result.threadId) args.sessionRef.sessionId = result.threadId;
  args.sink.emit({
    provider: 'codex',
    status: 'completed',
    message: 'Response complete',
    timestamp: Date.now(),
    session: args.sessionRef,
    tokenUsage: args.getUsage(),
    durationMs: result.durationMs,
  });
}

function handleLaunchError(error: unknown, args: CodexCompletionArgs): void {
  const errorMessage = buildFailureMessage(error);
  const wasCancelled = cancelledTasks.delete(args.taskId);
  cleanupLaunchArtifacts(args.taskId, args.invocationTempPaths);
  if (wasCancelled) {
    args.sink.emit({
      provider: 'codex',
      status: 'cancelled',
      message: 'Task cancelled by user',
      timestamp: Date.now(),
      session: args.sessionRef,
    });
    return;
  }
  args.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: errorMessage,
    timestamp: Date.now(),
    session: args.sessionRef,
    contentBlock: {
      blockIndex: args.getNextBlockIndex(),
      blockType: 'text',
      textDelta: `\n\n---\n**Codex stopped** - ${errorMessage}`,
    },
  });
  args.sink.emit({
    provider: 'codex',
    status: 'failed',
    message: errorMessage,
    timestamp: Date.now(),
    session: args.sessionRef,
  });
}

function scheduleCodexLaunch(args: {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId?: string;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexEvent) => void;
}): Promise<{ threadId: string | null; durationMs: number } | null> {
  return (async () => {
    if (args.context.request.goalAttachments?.length) {
      try {
        const materialized = await materializeAttachments(args.context.request.goalAttachments);
        args.invocationTempPaths.push(...materialized.imagePaths);
      } catch (error) {
        log.error('failed to materialize attachments:', error);
      }
    }

    if (args.getCancelledBeforeLaunch()) {
      activeProcesses.delete(args.context.taskId);
      return null;
    }

    const prompt = buildPrompt(args.context, args.model, Boolean(args.resumeThreadId));
    const handle = spawnCodexExecProcess({
      prompt,
      cwd: args.cwd,
      cliArgs: args.cliArgs,
      imagePaths: args.invocationTempPaths,
      onEvent: args.eventHandler,
      resumeThreadId: args.resumeThreadId,
    });
    activeProcesses.set(args.context.taskId, handle);
    return handle.result;
  })();
}

function launchCodex(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeThreadId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const cwd = context.request.workspaceRoots[0];
  const { cliArgs, model } = resolveSettings(context);
  const sessionRef = createProviderSessionReference('codex', {
    requestId,
    sessionId:
      resumeThreadId ||
      ('providerSession' in context ? context.providerSession?.sessionId : undefined),
    externalTaskId: context.taskId,
  });
  sink.emit({
    provider: 'codex',
    status: 'queued',
    message: 'Launching Codex session',
    timestamp: Date.now(),
    session: sessionRef,
  });
  const {
    handler: eventHandler,
    getNextBlockIndex,
    getUsage,
  } = buildCodexEventHandler(sink, sessionRef);
  const invocationTempPaths: string[] = [];
  let cancelledBeforeLaunch = false;
  const placeholder: CodexExecProcessHandle = {
    result: null as unknown as Promise<{ threadId: string | null; durationMs: number }>,
    kill: () => {
      const realHandle = activeProcesses.get(context.taskId);
      if (realHandle && realHandle !== placeholder) {
        realHandle.kill();
        return;
      }
      cancelledBeforeLaunch = true;
    },
    threadId: sessionRef.sessionId ?? null,
  };
  activeProcesses.set(context.taskId, placeholder);
  const resultPromise = scheduleCodexLaunch({
    context,
    cwd,
    cliArgs,
    model,
    resumeThreadId,
    invocationTempPaths,
    getCancelledBeforeLaunch: () => cancelledBeforeLaunch,
    eventHandler,
  });
  const completionArgs: CodexCompletionArgs = {
    taskId: context.taskId,
    sessionRef,
    sink,
    getUsage,
    getNextBlockIndex,
    invocationTempPaths,
  };
  resultPromise.then(
    (result) => handleLaunchSuccess(result, completionArgs),
    (error) => handleLaunchError(error, completionArgs),
  );
  sink.emit({
    provider: 'codex',
    status: 'queued',
    message: 'Codex session started',
    timestamp: Date.now(),
    session: sessionRef,
  });
  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'codex',
      status: 'streaming',
      session: sessionRef,
      submittedAt: Date.now(),
    }),
  };
}

export class CodexAdapter implements ProviderAdapter {
  readonly provider = 'codex' as const;

  getCapabilities(): ProviderCapabilities {
    return createCapabilities();
  }

  async submitTask(
    context: ProviderLaunchContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const resumeThreadId = context.request.resumeFromSessionId || undefined;
    return launchCodex(context, sink, resumeThreadId);
  }

  async resumeTask(
    context: ProviderResumeContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const resumeThreadId =
      context.providerSession?.sessionId || context.request.resumeFromSessionId || undefined;
    return launchCodex(context, sink, resumeThreadId);
  }

  async cancelTask(session: {
    requestId?: string;
    sessionId?: string;
    externalTaskId?: string;
  }): Promise<void> {
    const targetId = session.externalTaskId ?? session.requestId ?? session.sessionId;
    if (!targetId) return;
    const handle = activeProcesses.get(targetId);
    if (handle) {
      cancelledTasks.add(targetId);
      handle.kill();
      activeProcesses.delete(targetId);
      return;
    }
    for (const [taskId, proc] of activeProcesses) {
      if (proc.threadId === targetId || taskId === targetId) {
        cancelledTasks.add(taskId);
        proc.kill();
        activeProcesses.delete(taskId);
        return;
      }
    }
  }
}

export function createCodexAdapter(): CodexAdapter {
  return new CodexAdapter();
}
