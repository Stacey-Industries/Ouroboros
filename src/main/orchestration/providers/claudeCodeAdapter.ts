import path from 'path';

import { killPty } from '../../pty';
import type { ContextPacket, ProviderCapabilities } from '../types';
import { launchClaude } from './claudeCodeLaunch';
import { activeAgentPtySessions, activeProcesses, cancelledTasks } from './claudeCodeState';
import {
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';

export type { ContextPacket };
export { path };

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'claude-code',
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

function cancelPtySession(targetId: string): boolean {
  const agentPty = activeAgentPtySessions.get(targetId);
  if (agentPty) {
    agentPty.bridge.dispose();
    killPty(agentPty.ptySessionId);
    activeAgentPtySessions.delete(targetId);
    return true;
  }
  for (const [key, entry] of activeAgentPtySessions) {
    if (entry.ptySessionId === targetId || key === targetId) {
      entry.bridge.dispose();
      killPty(entry.ptySessionId);
      activeAgentPtySessions.delete(key);
      return true;
    }
  }
  return false;
}

function cancelHeadlessProcess(targetId: string): boolean {
  const handle = activeProcesses.get(targetId);
  if (handle) {
    cancelledTasks.add(targetId);
    handle.kill();
    activeProcesses.delete(targetId);
    return true;
  }
  for (const [key, proc] of activeProcesses) {
    if (proc.sessionId === targetId || key === targetId) {
      cancelledTasks.add(key);
      proc.kill();
      activeProcesses.delete(key);
      return true;
    }
  }
  return false;
}

export class ClaudeCodeAdapter implements ProviderAdapter {
  readonly provider = 'claude-code' as const;

  getCapabilities(): ProviderCapabilities {
    return createCapabilities();
  }

  async submitTask(
    context: ProviderLaunchContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    return launchClaude(context, sink);
  }

  async resumeTask(
    context: ProviderResumeContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const hasSessionId = !!context.providerSession?.sessionId;
    return launchClaude(
      context,
      sink,
      hasSessionId ? context.providerSession!.sessionId : undefined,
    );
  }

  async cancelTask(session: {
    requestId?: string;
    sessionId?: string;
    externalTaskId?: string;
  }): Promise<void> {
    const targetId = session.externalTaskId ?? session.requestId ?? session.sessionId;
    if (!targetId) return;
    if (cancelPtySession(targetId)) return;
    cancelHeadlessProcess(targetId);
  }
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter();
}
