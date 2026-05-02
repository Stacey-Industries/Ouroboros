import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';

export function cycleThread(
  threads: AgentChatWorkspaceModel['threads'],
  activeThreadId: string | null,
  direction: 'left' | 'right',
): string | null {
  if (threads.length < 2) return null;
  const idx = threads.findIndex((t) => t.id === activeThreadId);
  const base = idx < 0 ? 0 : idx;
  const next =
    direction === 'left'
      ? (base + 1) % threads.length
      : (base - 1 + threads.length) % threads.length;
  return threads[next].id;
}
