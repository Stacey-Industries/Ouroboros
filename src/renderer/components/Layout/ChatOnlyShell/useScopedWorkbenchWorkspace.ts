import { useRef } from 'react';

import { type AgentChatStoreInstance, createAgentChatStore } from '../../AgentChat/agentChatStore';

export function useScopedWorkbenchWorkspace(): AgentChatStoreInstance {
  return useRef(createAgentChatStore()).current;
}
