/**
 * agentChatEventForwarders.ts — Session-update projection + event forwarding
 * for the agentChat IPC handler.
 *
 * Extracted from agentChat.ts to stay under the 300-line ESLint limit.
 */

import {
  AGENT_CHAT_EVENT_CHANNELS,
  type AgentChatService,
} from '../agentChat';
import {
  buildAgentChatOrchestrationLink,
  mapOrchestrationStatusToAgentChatStatus,
} from '../agentChat/chatOrchestrationBridgeSupport';
import { projectAgentChatSession } from '../agentChat/eventProjector';
import { agentChatThreadStore } from '../agentChat/threadStore';
import log from '../logger';
import { broadcastToWebClients } from '../web/webServer';
import { getAllActiveWindows } from '../windowManager';
import type { MinimalOrchestration } from './agentChatOrchestration';

// ── Types ─────────────────────────────────────────────────────────────────────

type SafeSend = (channel: string | undefined, data: unknown) => void;
type SessionArg = Parameters<Parameters<MinimalOrchestration['onSessionUpdate']>[0]>[0];

// ── Event forwarding ──────────────────────────────────────────────────────────

export function makeSafeSend(): SafeSend {
  return (channel, data) => {
    if (!channel) return;
    for (const win of getAllActiveWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, data);
    }
    broadcastToWebClients(channel, data);
  };
}

async function projectAndSendSessionUpdate(
  svc: AgentChatService,
  session: SessionArg,
  safeSend: SafeSend,
): Promise<void> {
  const threadId =
    svc.bridge.findThreadIdForSession(session.id) ??
    svc.bridge.findThreadIdForSession(session.taskId);
  if (!threadId) return;
  const threadResult = await svc.loadThread(threadId);
  const linkedThread = threadResult.success ? threadResult.thread : undefined;
  if (!linkedThread) return;

  const activeThreadIds = svc.bridge.getActiveThreadIds();
  const isActivelyStreaming = activeThreadIds.includes(linkedThread.id);

  const projected = await projectAgentChatSession({
    session,
    thread: linkedThread,
    threadStore: agentChatThreadStore,
  });

  if (projected.changed && !isActivelyStreaming) {
    safeSend(AGENT_CHAT_EVENT_CHANNELS.thread, projected.thread);
  }

  const link = buildAgentChatOrchestrationLink(session);
  safeSend(AGENT_CHAT_EVENT_CHANNELS.status, {
    threadId: linkedThread.id,
    workspaceRoot: linkedThread.workspaceRoot,
    status: mapOrchestrationStatusToAgentChatStatus(session.status),
    latestMessageId: projected.latestMessageId,
    latestOrchestration: link,
    updatedAt: projected.thread.updatedAt,
  });
}

export function registerEventForwarders(
  svc: AgentChatService,
  orch: MinimalOrchestration,
  cleanupFns: Array<() => void>,
): void {
  const safeSend = makeSafeSend();

  cleanupFns.push(
    orch.onSessionUpdate((session) => {
      void (async () => {
        try {
          await projectAndSendSessionUpdate(svc, session, safeSend);
        } catch (error) {
          log.error('session-update projection failed:', error);
        }
      })();
    }),
  );
  cleanupFns.push(
    svc.bridge.onStreamChunk((chunk) => {
      safeSend(AGENT_CHAT_EVENT_CHANNELS.stream, chunk);
    }),
  );
}
