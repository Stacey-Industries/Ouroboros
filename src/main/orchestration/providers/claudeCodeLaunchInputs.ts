/**
 * claudeCodeLaunchInputs.ts — Wave 51 Phase B helper.
 *
 * Extracts the prompt-building, attachment-materialization, MCP-config
 * resolution, and final `launchHeadless` invocation out of
 * `claudeCodeLaunch.ts`. The split exists solely to keep that file under the
 * 300-line ESLint cap once Phase B's CodeMode wiring lands; logic is unchanged
 * from the prior inline implementation.
 */

import log from '../../logger';
import { buildInitialPrompt } from './claudeCodeContextBuilder';
import { cliSessionExists, launchHeadless, materializeAttachments } from './claudeCodeHelpers';
import type { ScheduleClaudeLaunchArgs } from './claudeCodeLaunch';
import { activeProcesses } from './claudeCodeState';
import { resolveMcpConfigPathForLaunch } from './scopedMcpConfig';
import type { StreamJsonResultEvent } from './streamJsonTypes';

export interface LaunchInputs {
  prompt: string;
  resumeId?: string;
  mcpConfigPath?: string;
  continueSession?: true;
  /** Wave 51 Phase C — true when the codemode acquire failed; consumed only by tests. */
  codemodeAcquireFailed?: boolean;
}

async function resolveGoalSuffix(
  context: ScheduleClaudeLaunchArgs['context'],
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

function resolveResumeSessionId(args: ScheduleClaudeLaunchArgs): string | undefined {
  const id = args.effectiveResumeSessionId;
  if (!id) return undefined;
  if (cliSessionExists(args.cwd, id)) return id;
  log.info('session file pruned by CLI, falling back to conversation history:', id);
  return undefined;
}

export interface BuildLaunchInputsExtras {
  /** Wave 51 Phase C — set when codemode acquire failed before this call;
   *  triggers the routing-policy downgrade in scopedMcpConfig. */
  codemodeAcquireFailed?: boolean;
}

export async function buildLaunchInputs(
  args: ScheduleClaudeLaunchArgs,
  extras: BuildLaunchInputsExtras = {},
): Promise<LaunchInputs | null> {
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
  const continueSession = 'providerSession' in args.context && !resumeId ? true : undefined;
  const mcpConfigPath = await resolveMcpConfigPathForLaunch({
    goal: args.context.request.goal,
    sessionId: args.context.taskId,
    invocationTempPaths: args.invocationTempPaths,
    codemodeAcquireFailed: extras.codemodeAcquireFailed,
  });
  return { prompt, resumeId, mcpConfigPath, continueSession };
}

export async function runLaunch(
  args: ScheduleClaudeLaunchArgs,
  inputs: LaunchInputs,
): Promise<StreamJsonResultEvent | null> {
  return launchHeadless({
    context: args.context,
    prompt: inputs.prompt,
    cwd: args.cwd,
    settings: args.effectiveSettings,
    sessionRef: args.sessionRef,
    sink: args.sink,
    resumeSessionId: inputs.resumeId,
    continueSession: inputs.continueSession,
    effort: args.effort,
    providerEnv: args.isProviderRouted ? args.providerEnv : undefined,
    eventHandler: args.eventHandler,
    mcpConfigPath: inputs.mcpConfigPath,
    projectRoot: args.cwd,
  }).result;
}
