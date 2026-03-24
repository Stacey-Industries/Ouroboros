/**
 * claudeCodeLaunch.ts — Launch coordination for the Claude Code adapter.
 *
 * Extracted from claudeCodeAdapter.ts to keep each file under 300 lines.
 * Contains scheduleClaudeLaunch, launchClaude and their direct helpers.
 */

import { type ClaudeCliSettings, getConfigValue } from '../../config';
import log from '../../logger';
import { resolveModelEnv } from '../../providers';
import { buildInitialPrompt } from './claudeCodeContextBuilder';
import { buildEventHandler } from './claudeCodeEventHandler';
import {
  handleLaunchError,
  handleLaunchSuccess,
  launchHeadless,
  materializeAttachments,
} from './claudeCodeHelpers';
import { activeProcesses, buildPlaceholderHandle, type CompletionArgs } from './claudeCodeState';
import {
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';
import type { StreamJsonEvent, StreamJsonResultEvent } from './streamJsonTypes';

export function pickLaunchValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) if (value) return value;
  return undefined;
}

export function resolveEffectiveSettings(
  context: ProviderLaunchContext | ProviderResumeContext,
  settings: ClaudeCliSettings,
): {
  resolvedModel: string | undefined;
  effort: string | undefined;
  effectiveSettings: ClaudeCliSettings;
  providerEnv: Record<string, string>;
  isProviderRouted: boolean;
} {
  const resolvedModel = pickLaunchValue(context.request.model, settings.model);
  const effort = pickLaunchValue(context.request.effort, settings.effort);
  const permissionMode =
    pickLaunchValue(context.request.permissionMode, settings.permissionMode) ?? 'default';
  const providerEnv =
    resolvedModel && resolvedModel.includes(':') ? resolveModelEnv(resolvedModel) : {};
  const isProviderRouted = Object.keys(providerEnv).length > 0;
  return {
    resolvedModel,
    effort,
    effectiveSettings: {
      ...settings,
      model: isProviderRouted ? '' : (resolvedModel ?? ''),
      permissionMode,
    },
    providerEnv,
    isProviderRouted,
  };
}

async function resolveGoalSuffix(
  context: ProviderLaunchContext | ProviderResumeContext,
  invocationTempPaths: string[],
): Promise<string> {
  if (!context.request.goalAttachments?.length) return '';
  try {
    const materialized = await materializeAttachments(context.request.goalAttachments);
    invocationTempPaths.push(...materialized.tempPaths);
    return materialized.goalSuffix;
  } catch (err) {
    log.error('failed to materialize attachments — images will be omitted:', err);
    return '';
  }
}

export function scheduleClaudeLaunch(args: {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  resolvedModel: string | undefined;
  effectiveResumeSessionId: string | undefined;
  effectiveSettings: ClaudeCliSettings;
  eventHandler: (event: StreamJsonEvent) => void;
  effort: string | undefined;
  providerEnv: Record<string, string>;
  isProviderRouted: boolean;
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
}): Promise<StreamJsonResultEvent | null> {
  return (async () => {
    const goalSuffix = await resolveGoalSuffix(args.context, args.invocationTempPaths);
    if (args.getCancelledBeforeLaunch()) {
      activeProcesses.delete(args.context.taskId);
      return null;
    }
    return launchHeadless({
      context: args.context,
      prompt: buildInitialPrompt(
        args.context,
        goalSuffix,
        Boolean(args.effectiveResumeSessionId),
        args.resolvedModel ?? '',
      ),
      cwd: args.cwd,
      settings: args.effectiveSettings,
      sessionRef: args.sessionRef,
      sink: args.sink,
      resumeSessionId: args.effectiveResumeSessionId,
      continueSession:
        'providerSession' in args.context && !args.effectiveResumeSessionId ? true : undefined,
      effort: args.effort,
      providerEnv: args.isProviderRouted ? args.providerEnv : undefined,
      eventHandler: args.eventHandler,
    }).result;
  })();
}

interface BuildCompletionArgsOptions {
  context: ProviderLaunchContext | ProviderResumeContext;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  resolvedModel: string | undefined;
  invocationTempPaths: string[];
  getNextGlobalBlockIndex: () => number;
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number };
}

function buildCompletionArgs(opts: BuildCompletionArgsOptions): CompletionArgs {
  return {
    taskId: opts.context.taskId,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    invocationTempPaths: opts.invocationTempPaths,
    resolvedModel: opts.resolvedModel,
    getNextGlobalBlockIndex: opts.getNextGlobalBlockIndex,
    getCumulativeUsage: opts.getCumulativeUsage,
  };
}

function setupLaunchSession(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  requestId: string,
) {
  const sessionRef = createProviderSessionReference('claude-code', {
    requestId,
    sessionId: 'providerSession' in context ? context.providerSession?.sessionId : undefined,
    externalTaskId: context.taskId,
  });
  const {
    handler: eventHandler,
    getNextGlobalBlockIndex,
    getCumulativeUsage,
  } = buildEventHandler(sink, sessionRef);
  return { sessionRef, eventHandler, getNextGlobalBlockIndex, getCumulativeUsage };
}

export function launchClaude(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeSessionId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const settings = getConfigValue('claudeCliSettings') as ClaudeCliSettings;
  const cwd = context.request.workspaceRoots[0];
  const { resolvedModel, effort, effectiveSettings, providerEnv, isProviderRouted } =
    resolveEffectiveSettings(context, settings);
  const effectiveResumeSessionId =
    resumeSessionId || context.request.resumeFromSessionId || undefined;
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Launching Claude Code session',
    timestamp: Date.now(),
  });
  const { sessionRef, eventHandler, getNextGlobalBlockIndex, getCumulativeUsage } =
    setupLaunchSession(context, sink, requestId);
  const { placeholder, getCancelledBeforeLaunch } = buildPlaceholderHandle(context.taskId);
  activeProcesses.set(context.taskId, placeholder);
  const invocationTempPaths: string[] = [];
  const completionArgs = buildCompletionArgs({
    context,
    sessionRef,
    sink,
    resolvedModel,
    invocationTempPaths,
    getNextGlobalBlockIndex,
    getCumulativeUsage,
  });
  scheduleClaudeLaunch({
    context,
    cwd,
    sessionRef,
    sink,
    resolvedModel,
    effectiveResumeSessionId,
    effectiveSettings,
    eventHandler,
    effort,
    providerEnv,
    isProviderRouted,
    getCancelledBeforeLaunch,
    invocationTempPaths,
  }).then(
    (result) => handleLaunchSuccess(result, completionArgs),
    (error) => handleLaunchError(error, completionArgs),
  );
  const submittedAt = Date.now();
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Claude Code session started',
    timestamp: submittedAt,
    session: sessionRef,
  });
  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'claude-code',
      status: 'streaming',
      session: sessionRef,
      submittedAt,
    }),
  };
}
