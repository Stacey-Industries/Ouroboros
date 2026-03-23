import type { OrchestrationAPI } from '../orchestration/types';
import { projectAgentChatSession } from './eventProjector';
import type { AgentChatThreadStore } from './threadStore';
import type { AgentChatOrchestrationLink, AgentChatThreadRecord } from './types';

function getLatestThreadLink(
  thread: AgentChatThreadRecord,
): AgentChatOrchestrationLink | undefined {
  if (thread.latestOrchestration) {
    return thread.latestOrchestration;
  }

  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const msg = thread.messages.at(index);
    const link = msg?.orchestration;
    if (link) {
      return link;
    }
  }

  return undefined;
}

export async function hydrateAgentChatThread(args: {
  orchestration: Pick<OrchestrationAPI, 'loadSession'>;
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatThreadRecord> {
  const link = getLatestThreadLink(args.thread);
  if (!link?.sessionId) {
    return args.thread;
  }

  const sessionResult = await args.orchestration.loadSession(link.sessionId);
  if (!sessionResult.success || !sessionResult.session) {
    return args.thread;
  }

  const projection = await projectAgentChatSession({
    session: sessionResult.session,
    thread: args.thread,
    threadStore: args.threadStore,
  });

  return projection.thread;
}

export async function hydrateLatestAgentChatThread(args: {
  orchestration: Pick<OrchestrationAPI, 'loadSession'>;
  threadStore: AgentChatThreadStore;
  workspaceRoot: string;
}): Promise<AgentChatThreadRecord | null> {
  const thread = await args.threadStore.loadLatestThread(args.workspaceRoot);
  if (!thread) {
    return null;
  }

  return hydrateAgentChatThread({
    orchestration: args.orchestration,
    thread,
    threadStore: args.threadStore,
  });
}
