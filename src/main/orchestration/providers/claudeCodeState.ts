/**
 * claudeCodeState.ts — Shared mutable runtime state for the Claude Code adapter.
 *
 * Extracted from claudeCodeAdapter.ts to avoid circular imports between
 * claudeCodeAdapter.ts and claudeCodeLaunch.ts.
 */

import type { AgentBridgeHandle } from '../../ptyAgentBridge';
import { createProviderSessionReference, type ProviderProgressSink } from './providerAdapter';
import type { StreamJsonProcessHandle, StreamJsonResultEvent } from './streamJsonTypes';

export interface ActiveAgentPtyEntry {
  ptySessionId: string;
  bridge: AgentBridgeHandle;
  result: Promise<StreamJsonResultEvent | null>;
}

export const activeProcesses = new Map<string, StreamJsonProcessHandle>();
export const cancelledTasks = new Set<string>();
export const activeAgentPtySessions = new Map<string, ActiveAgentPtyEntry>();

export interface CompletionArgs {
  taskId: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  invocationTempPaths: string[];
  resolvedModel: string | undefined;
  getNextGlobalBlockIndex: () => number;
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number };
}

export function buildPlaceholderHandle(taskId: string): {
  placeholder: StreamJsonProcessHandle;
  getCancelledBeforeLaunch: () => boolean;
} {
  let cancelledBeforeLaunch = false;
  const placeholder: StreamJsonProcessHandle = {
    result: null as unknown as Promise<StreamJsonResultEvent>,
    kill: () => {
      const realHandle = activeProcesses.get(taskId);
      if (realHandle && realHandle !== placeholder) {
        realHandle.kill();
        return;
      }
      cancelledBeforeLaunch = true;
    },
    pid: undefined,
    sessionId: null,
  };
  return { placeholder, getCancelledBeforeLaunch: () => cancelledBeforeLaunch };
}
