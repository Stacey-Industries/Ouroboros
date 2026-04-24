/**
 * chatOrchestrationBridgeProgressHelpers.ts — Pure helpers extracted from
 * chatOrchestrationBridgeProgress.ts to keep that file under the 300-line ESLint limit.
 */

import log from '../logger';
import type { ProviderProgressEvent } from '../orchestration/types';
import { emitStreamChunk } from './chatOrchestrationBridgeMonitor';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';

export function logFirstChunk(ctx: ActiveStreamContext): void {
  if (ctx.firstChunkLogged) return;
  ctx.firstChunkLogged = true;
  if (typeof ctx.sendStartedAt === 'number') {
    log.info(
      '[chat-perf] time-to-first-chunk:',
      Date.now() - ctx.sendStartedAt,
      'ms',
      'thread:',
      ctx.threadId,
    );
  }
}

export function findContextForProgress(
  activeSends: AgentChatBridgeRuntime['activeSends'],
  progress: ProviderProgressEvent,
): ActiveStreamContext | undefined {
  for (const [, entry] of activeSends) {
    if (
      progress.session?.sessionId === entry.sessionId ||
      progress.session?.externalTaskId === entry.taskId ||
      progress.session?.requestId?.includes(entry.taskId)
    ) {
      return entry;
    }
  }
  return undefined;
}

export type ProgressToolActivity = NonNullable<
  NonNullable<ProviderProgressEvent['contentBlock']>['toolActivity']
>;

interface EmitToolActivityArgs {
  listeners: AgentChatBridgeRuntime['streamChunkListeners'];
  ctx: ActiveStreamContext;
  blockIndex: number;
  toolActivity: ProgressToolActivity;
  now: number;
}

export function emitToolActivityChunk(args: EmitToolActivityArgs): void {
  const { listeners, ctx, blockIndex, toolActivity, now } = args;
  emitStreamChunk(
    listeners,
    {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'tool_activity',
      blockIndex,
      toolActivity: {
        name: toolActivity.name,
        status: toolActivity.status,
        filePath: toolActivity.filePath,
        inputSummary: toolActivity.inputSummary,
        editSummary: toolActivity.editSummary,
        output: toolActivity.output,
      },
      timestamp: now,
      tokenUsage: ctx.tokenUsage,
    },
    ctx,
  );
}
