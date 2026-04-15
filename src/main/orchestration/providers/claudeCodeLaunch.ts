// claudeCodeLaunch.ts — Launch coordination for the Claude Code adapter.

import { type ClaudeCliSettings, getConfigValue } from '../../config';
import log from '../../logger';
import { resolveModelEnv } from '../../providers';
import { buildInitialPrompt } from './claudeCodeContextBuilder';
import { buildEventHandler } from './claudeCodeEventHandler';
import {
  cliSessionExists,
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

/** Returns worktreePath when the task's session has an active worktree, else root. */
function resolveTaskCwd(root: string, sessionId: string | undefined): string {
  if (!sessionId) return root;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSessionStore } = require('../../session/sessionStore') as typeof import('../../session/sessionStore');
    const wt = getSessionStore()?.getById(sessionId);
    return wt?.worktree && wt.worktreePath ? wt.worktreePath : root;
  } catch { return root; }
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

export interface ScheduleClaudeLaunchArgs {
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
}

function resolveResumeSessionId(args: ScheduleClaudeLaunchArgs): string | undefined {
  const id = args.effectiveResumeSessionId;
  if (!id) return undefined;
  if (cliSessionExists(args.cwd, id)) return id;
  log.info('session file pruned by CLI, falling back to conversation history:', id);
  return undefined;
}

export function scheduleClaudeLaunch(
  args: ScheduleClaudeLaunchArgs,
): Promise<StreamJsonResultEvent | null> {
  return (async () => {
    const goalSuffix = await resolveGoalSuffix(args.context, args.invocationTempPaths);
    if (args.getCancelledBeforeLaunch()) {
      activeProcesses.delete(args.context.taskId);
      return null;
    }
    const resumeId = resolveResumeSessionId(args);
    const prompt = buildInitialPrompt(
      args.context,
      goalSuffix,
      Boolean(resumeId),
      args.resolvedModel ?? '',
    );
    const continueSession =
      'providerSession' in args.context && !resumeId ? true : undefined;
    return launchHeadless({
      context: args.context,
      prompt,
      cwd: args.cwd,
      settings: args.effectiveSettings,
      sessionRef: args.sessionRef,
      sink: args.sink,
      resumeSessionId: resumeId,
      continueSession,
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
  const { context, sessionRef, sink, invocationTempPaths, resolvedModel, getNextGlobalBlockIndex, getCumulativeUsage } = opts;
  return { taskId: context.taskId, sessionRef, sink, invocationTempPaths, resolvedModel, getNextGlobalBlockIndex, getCumulativeUsage };
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

interface BuildLaunchScheduleArgsOpts {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  resolved: ReturnType<typeof resolveEffectiveSettings>;
  effectiveResumeSessionId: string | undefined;
  eventHandler: (event: StreamJsonEvent) => void;
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
}

function buildLaunchScheduleArgs(opts: BuildLaunchScheduleArgsOpts): ScheduleClaudeLaunchArgs {
  const { context, cwd, sessionRef, sink, resolved, effectiveResumeSessionId, eventHandler, getCancelledBeforeLaunch, invocationTempPaths } = opts;
  return {
    context, cwd, sessionRef, sink, invocationTempPaths,
    resolvedModel: resolved.resolvedModel, effectiveResumeSessionId,
    effectiveSettings: resolved.effectiveSettings, eventHandler,
    effort: resolved.effort, providerEnv: resolved.providerEnv,
    isProviderRouted: resolved.isProviderRouted, getCancelledBeforeLaunch,
  };
}

function emitLaunchQueued(sink: ProviderProgressSink): void {
  sink.emit({ provider: 'claude-code', status: 'queued', message: 'Launching Claude Code session', timestamp: Date.now() });
}

function buildLaunchResult(sessionRef: ReturnType<typeof createProviderSessionReference>): ProviderLaunchResult {
  return {
    session: sessionRef,
    artifact: createProviderArtifact({ provider: 'claude-code', status: 'streaming', session: sessionRef, submittedAt: Date.now() }),
  };
}

function emitLaunchStarted(sink: ProviderProgressSink, sessionRef: ReturnType<typeof createProviderSessionReference>): void {
  sink.emit({ provider: 'claude-code', status: 'queued', message: 'Claude Code session started', timestamp: Date.now(), session: sessionRef });
}

interface ScheduleLaunchOpts {
  context: ProviderLaunchContext | ProviderResumeContext;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  cwd: string;
  resolved: ReturnType<typeof resolveEffectiveSettings>;
  effectiveResumeSessionId: string | undefined;
  eventHandler: (event: StreamJsonEvent) => void;
  getCancelledBeforeLaunch: () => boolean;
  getNextGlobalBlockIndex: () => number;
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number };
}

function scheduleLaunch(opts: ScheduleLaunchOpts): void {
  const invocationTempPaths: string[] = [];
  const completionArgs = buildCompletionArgs({
    context: opts.context,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    resolvedModel: opts.resolved.resolvedModel,
    invocationTempPaths,
    getNextGlobalBlockIndex: opts.getNextGlobalBlockIndex,
    getCumulativeUsage: opts.getCumulativeUsage,
  });
  const launchArgs = buildLaunchScheduleArgs({
    context: opts.context,
    cwd: opts.cwd,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    resolved: opts.resolved,
    effectiveResumeSessionId: opts.effectiveResumeSessionId,
    eventHandler: opts.eventHandler,
    getCancelledBeforeLaunch: opts.getCancelledBeforeLaunch,
    invocationTempPaths,
  });
  scheduleClaudeLaunch(launchArgs).then(
    (result) => handleLaunchSuccess(result, completionArgs),
    (error) => handleLaunchError(error, completionArgs),
  );
}

export function launchClaude(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeSessionId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const settings = getConfigValue('claudeCliSettings') as ClaudeCliSettings;
  const cwd = resolveTaskCwd(context.request.workspaceRoots[0], context.request.sessionId);
  const resolved = resolveEffectiveSettings(context, settings);
  const effectiveResumeSessionId =
    resumeSessionId || context.request.resumeFromSessionId || undefined;
  emitLaunchQueued(sink);
  const { sessionRef, eventHandler, getNextGlobalBlockIndex, getCumulativeUsage } =
    setupLaunchSession(context, sink, requestId);
  const { placeholder, getCancelledBeforeLaunch } = buildPlaceholderHandle(context.taskId);
  activeProcesses.set(context.taskId, placeholder);
  scheduleLaunch({
    context,
    sessionRef,
    sink,
    cwd,
    resolved,
    effectiveResumeSessionId,
    eventHandler,
    getCancelledBeforeLaunch,
    getNextGlobalBlockIndex,
    getCumulativeUsage,
  });
  emitLaunchStarted(sink, sessionRef);
  return buildLaunchResult(sessionRef);
}
