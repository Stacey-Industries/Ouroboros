/**
 * threadStoreFork.ts — Wave 23 Phase A
 *
 * forkThread, renameBranch, listBranchesOfThread store operations.
 * Kept separate from threadStore.ts to respect the 300-line ESLint limit.
 */

import type { AgentChatThreadRecord, BranchNode } from './types';

// ── Runtime adapter interface ─────────────────────────────────────────────────
// Narrowed interface so tests can mock without instantiating the full runtime.

export interface ForkRuntimeAdapter {
  requireThread: (id: string) => Promise<AgentChatThreadRecord>;
  writeThread: (thread: AgentChatThreadRecord) => Promise<AgentChatThreadRecord>;
  loadAllThreads: () => Promise<AgentChatThreadRecord[]>;
  /** Wave 23 Phase A — targeted SQL for branch rename. */
  renameBranchSql: (threadId: string, name: string | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildForkTitle(sourceTitle: string, isSideChat: boolean): string {
  const prefix = isSideChat ? 'Side chat: ' : 'Fork of ';
  if (sourceTitle.startsWith(prefix)) return sourceTitle;
  return `${prefix}${sourceTitle}`;
}

function resolveHistoryMessages(
  source: AgentChatThreadRecord,
  fromMessageId: string,
  includeHistory: boolean,
  newId: string,
): AgentChatThreadRecord['messages'] {
  const systemMessages = source.messages
    .filter((m) => m.role === 'system')
    .map((m) => ({ ...m, threadId: newId }));

  if (!includeHistory) return systemMessages;

  const idx = source.messages.findIndex((m) => m.id === fromMessageId);
  if (idx === -1) throw new Error(`Message not found: ${fromMessageId}`);

  return source.messages.slice(0, idx + 1).map((m) => ({ ...m, threadId: newId }));
}

// ── forkThread ────────────────────────────────────────────────────────────────

export interface ForkThreadParams {
  sourceThreadId: string;
  fromMessageId: string;
  includeHistory: boolean;
  isSideChat?: boolean;
}

export async function forkThreadImpl(args: {
  createId: () => string;
  now: () => number;
  params: ForkThreadParams;
  runtime: ForkRuntimeAdapter;
}): Promise<AgentChatThreadRecord> {
  const { createId, now, params, runtime } = args;
  const source = await runtime.requireThread(params.sourceThreadId);
  const timestamp = now();
  const newId = createId();
  const isSideChat = params.isSideChat ?? false;

  const messages = resolveHistoryMessages(
    source,
    params.fromMessageId,
    params.includeHistory,
    newId,
  );

  return runtime.writeThread({
    version: 1,
    id: newId,
    workspaceRoot: source.workspaceRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: buildForkTitle(source.title, isSideChat),
    status: 'idle',
    messages,
    latestOrchestration: undefined,
    tags: source.tags ? [...source.tags] : [],
    forkOfMessageId: params.fromMessageId,
    parentThreadId: source.id,
    isSideChat,
  });
}

// ── renameBranch ──────────────────────────────────────────────────────────────

export function renameBranchImpl(
  runtime: ForkRuntimeAdapter,
  threadId: string,
  name: string,
): void {
  runtime.renameBranchSql(threadId, name.trim() || null);
}

// ── listBranchesOfThread ──────────────────────────────────────────────────────

function buildBranchNodeFromThread(
  thread: AgentChatThreadRecord,
  adjMap: Map<string, AgentChatThreadRecord[]>,
  visited: Set<string>,
): BranchNode {
  visited.add(thread.id);
  const children = adjMap.get(thread.id) ?? [];
  const childNodes: BranchNode[] = [];
  for (const child of children) {
    if (!visited.has(child.id)) {
      childNodes.push(buildBranchNodeFromThread(child, adjMap, visited));
    }
  }
  return {
    id: thread.id,
    branchName: thread.branchName,
    parentThreadId: thread.parentThreadId,
    forkOfMessageId: thread.forkOfMessageId,
    isSideChat: thread.isSideChat ?? false,
    children: childNodes,
  };
}

export async function listBranchesOfThreadImpl(
  runtime: ForkRuntimeAdapter,
  rootThreadId: string,
): Promise<BranchNode[]> {
  const allThreads = await runtime.loadAllThreads();

  // Build adjacency map: parentThreadId → children
  const adjMap = new Map<string, AgentChatThreadRecord[]>();
  for (const t of allThreads) {
    if (!t.parentThreadId) continue;
    const siblings = adjMap.get(t.parentThreadId) ?? [];
    siblings.push(t);
    adjMap.set(t.parentThreadId, siblings);
  }

  const directChildren = adjMap.get(rootThreadId) ?? [];
  const visited = new Set<string>([rootThreadId]);
  return directChildren.map((child) =>
    buildBranchNodeFromThread(child, adjMap, visited),
  );
}

