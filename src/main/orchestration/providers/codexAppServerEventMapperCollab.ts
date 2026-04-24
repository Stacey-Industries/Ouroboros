/**
 * codexAppServerEventMapperCollab.ts — Collab tool, child-command, and file-change emitters.
 *
 * Extracted from codexAppServerEventMapper.ts to keep that file under the
 * 300-line ESLint limit.
 */

import log from '../../logger';
import {
  bindChildThreadsToParent,
  type CodexEmitCtx,
  emitSubToolActivity,
  nextBlockIndex,
  resolveParentForThread,
} from './codexAppServerEventMapperCtx';
import {
  asRecord,
  asString,
  asStringArray,
  mapFileChangeKindToTool,
  summarizeCommand,
  summarizeFileChange,
  truncate,
} from './codexAppServerEventMapperShared';

export type { CodexEmitCtx };

// ─── Collab label / status helpers ───────────────────────────────────────────

export function mapCollabToolName(tool: string | undefined): string {
  switch (tool) {
    case 'spawnAgent':
      return 'spawn_agent';
    case 'sendInput':
      return 'send_input';
    case 'resumeAgent':
      return 'resume_agent';
    case 'wait':
      return 'wait_agent';
    case 'closeAgent':
      return 'close_agent';
    default:
      return tool ?? 'agent';
  }
}

function mapAgentStatus(status: string | undefined): 'running' | 'complete' {
  return status === 'pendingInit' || status === 'running' ? 'running' : 'complete';
}

export function buildCollabSummary(item: Record<string, unknown>): string | undefined {
  const prompt = asString(item.prompt);
  if (prompt) return truncate(prompt, 200);
  const parts = [asString(item.model), asString(item.reasoningEffort)].filter((p): p is string =>
    Boolean(p),
  );
  if (parts.length > 0) return parts.join(' / ');
  const receivers = asStringArray(item.receiverThreadIds);
  if (receivers.length > 0) {
    return `targets ${receivers.length} agent${receivers.length === 1 ? '' : 's'}`;
  }
  return undefined;
}

function buildAgentStateSummary(threadId: string, state: Record<string, unknown> | null): string {
  const short = threadId.length > 12 ? `${threadId.slice(0, 8)}...` : threadId;
  const msg = asString(state?.message);
  return msg ? truncate(`${short}: ${msg}`, 200) : short;
}

// ─── emitCollabStates ─────────────────────────────────────────────────────────

export interface EmitCollabStatesOptions {
  ctx: CodexEmitCtx;
  parent: { parentBlockIndex: number; parentToolName: string };
  itemId: string;
  receiverThreadIds: string[];
  states: Record<string, unknown> | null;
}

export function emitCollabStates(options: EmitCollabStatesOptions): void {
  const { ctx, parent, itemId, receiverThreadIds, states } = options;
  const threadIds = new Set<string>([...receiverThreadIds, ...Object.keys(states ?? {})]);
  for (const threadId of threadIds) {
    const state = asRecord(states ? Reflect.get(states, threadId) : undefined);
    emitSubToolActivity(ctx, parent, {
      name: 'Agent',
      status: mapAgentStatus(asString(state?.status)),
      subToolId: `${itemId}:state:${threadId}`,
      inputSummary: buildAgentStateSummary(threadId, state),
    });
  }
}

// ─── emitChildCommand ─────────────────────────────────────────────────────────

export interface EmitChildCommandOptions {
  ctx: CodexEmitCtx;
  parent: { parentBlockIndex: number; parentToolName: string };
  itemKey: string;
  status: 'running' | 'complete';
  command: string | undefined;
  output?: string;
}

export function emitChildCommand(options: EmitChildCommandOptions): void {
  const { ctx, parent, itemKey, status, command, output } = options;
  const existing = ctx.childCommandBlocks.get(itemKey);
  const subToolId = existing?.subToolId ?? `${itemKey}:command`;
  if (status === 'running') {
    ctx.childCommandBlocks.set(itemKey, { ...parent, subToolId });
  } else {
    ctx.childCommandBlocks.delete(itemKey);
  }
  emitSubToolActivity(ctx, parent, {
    name: 'Bash',
    status,
    subToolId,
    inputSummary: summarizeCommand(command),
    output,
  });
}

// ─── emitFileChanges ──────────────────────────────────────────────────────────

export function emitFileChanges(ctx: CodexEmitCtx, item: Record<string, unknown>): void {
  const changes = Array.isArray(item.changes) ? item.changes : [];
  for (const change of changes) {
    const record = asRecord(change);
    const filePath = asString(record?.path);
    if (!filePath) continue;
    const inputSummary = summarizeFileChange(asString(record?.kind));
    const name = mapFileChangeKindToTool(asString(record?.kind));
    const blockIndex = nextBlockIndex(ctx);
    const base = {
      provider: 'codex' as const,
      status: 'streaming' as const,
      message: '',
      timestamp: Date.now(),
      session: ctx.sessionRef,
    };
    ctx.sink.emit({
      ...base,
      contentBlock: {
        blockIndex,
        blockType: 'tool_use',
        toolActivity: { name, status: 'running', filePath, inputSummary },
      },
    });
    ctx.sink.emit({
      ...base,
      contentBlock: {
        blockIndex,
        blockType: 'tool_use',
        toolActivity: { name, status: 'complete', filePath, inputSummary },
      },
    });
  }
}

export function emitChildFileChanges(
  ctx: CodexEmitCtx,
  parent: { parentBlockIndex: number; parentToolName: string },
  itemKey: string,
  item: Record<string, unknown>,
): void {
  const changes = Array.isArray(item.changes) ? item.changes : [];
  changes.forEach((change, index) => {
    const record = asRecord(change);
    const filePath = asString(record?.path);
    if (!filePath) return;
    const inputSummary = summarizeFileChange(asString(record?.kind));
    const name = mapFileChangeKindToTool(asString(record?.kind));
    const subToolId = `${itemKey}:file:${index}`;
    emitSubToolActivity(ctx, parent, {
      name,
      status: 'running',
      subToolId,
      filePath,
      inputSummary,
    });
    emitSubToolActivity(ctx, parent, {
      name,
      status: 'complete',
      subToolId,
      filePath,
      inputSummary,
    });
  });
}

// ─── emitCollabTool ───────────────────────────────────────────────────────────

interface CollabEmitArgs {
  ctx: CodexEmitCtx;
  itemId: string;
  toolName: string;
  inputSummary: string | undefined;
  status: 'running' | 'complete';
  receiverThreadIds: string[];
  states: Record<string, unknown> | null;
}

function emitCollabTopLevel(args: CollabEmitArgs): void {
  const { ctx, itemId, toolName, inputSummary, status, receiverThreadIds, states } = args;
  const existing = ctx.collabBlocks.get(itemId);
  const blockIndex = existing?.blockIndex ?? nextBlockIndex(ctx);
  const parent = { parentBlockIndex: blockIndex, parentToolName: toolName };
  ctx.collabBlocks.set(itemId, { blockIndex, toolName });
  bindChildThreadsToParent(ctx, parent, receiverThreadIds);
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: '',
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex,
      blockType: 'tool_use',
      toolActivity: { name: toolName, status, inputSummary },
    },
  });
  emitCollabStates({ ctx, parent, itemId, receiverThreadIds, states });
}

function emitCollabAsSubTool(
  args: CollabEmitArgs,
  existingParent: { parentBlockIndex: number; parentToolName: string },
): void {
  const { ctx, itemId, toolName, inputSummary, status, receiverThreadIds, states } = args;
  emitSubToolActivity(ctx, existingParent, {
    name: toolName,
    status,
    subToolId: `${itemId}:collab`,
    inputSummary,
  });
  bindChildThreadsToParent(ctx, existingParent, receiverThreadIds);
  emitCollabStates({ ctx, parent: existingParent, itemId, receiverThreadIds, states });
}

export function emitCollabTool(
  ctx: CodexEmitCtx,
  item: Record<string, unknown>,
  status: 'running' | 'complete',
  threadId: string | undefined,
): void {
  const args: CollabEmitArgs = {
    ctx,
    itemId: asString(item.id) ?? 'collab-item',
    receiverThreadIds: asStringArray(item.receiverThreadIds),
    states: asRecord(item.agentsStates),
    toolName: mapCollabToolName(asString(item.tool)),
    inputSummary: buildCollabSummary(item),
    status,
  };
  const existingParent = resolveParentForThread(ctx, threadId);
  if (existingParent) {
    emitCollabAsSubTool(args, existingParent);
    return;
  }
  emitCollabTopLevel(args);
}

// ─── handleThreadStarted ──────────────────────────────────────────────────────

export function handleThreadStarted(
  params: Record<string, unknown> | undefined,
  sessionRef: { sessionId?: string },
): void {
  const thread = asRecord(params?.thread);
  const threadId = asString(thread?.id) || asString(params?.threadId);
  if (!threadId) return;
  if (!sessionRef.sessionId) sessionRef.sessionId = threadId;
  log.info(`[codex-diag] thread/started → captured thread_id=${threadId}`);
}
