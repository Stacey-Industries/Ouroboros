import {
  emitChildCommand,
  emitChildFileChanges,
  emitCollabTool,
  emitFileChanges,
  handleThreadStarted,
} from './codexAppServerEventMapperCollab';
import {
  type CodexEmitCtx,
  emitChildTranscriptFromText,
  emitRootTranscriptFromText,
  emitTextBlock,
  resolveParentForThread,
  resolveRootThreadId,
} from './codexAppServerEventMapperCtx';
import {
  asRecord,
  asString,
  extractItem,
  extractItemId,
  extractItemType,
  extractThreadId,
} from './codexAppServerEventMapperShared';
import type { createProviderSessionReference, ProviderProgressSink } from './providerAdapter';

type SessionRef = ReturnType<typeof createProviderSessionReference>;

export interface CodexAppServerMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

// ─── emitCommand (root-thread Bash) ──────────────────────────────────────────

function resolveCommandBlockIndex(ctx: CodexEmitCtx, itemId: string, running: boolean): number {
  if (!running) {
    const existing = ctx.commandBlocks.get(itemId);
    if (existing !== undefined) return existing;
  }
  return ctx.blockIndexRef.value++;
}

function emitCommand(ctx: CodexEmitCtx, itemId: string, status: 'complete' | 'running', command: string | undefined): void {
  const inputSummary = command && command.length > 200 ? `${command.slice(0, 197)}...` : command;
  const blockIndex = resolveCommandBlockIndex(ctx, itemId, status === 'running');
  if (status === 'running') ctx.commandBlocks.set(itemId, blockIndex);
  else ctx.commandBlocks.delete(itemId);
  ctx.sink.emit({
    provider: 'codex', status: 'streaming', message: '', timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: { blockIndex, blockType: 'tool_use', toolActivity: { name: 'Bash', status, inputSummary } },
  });
}

function emitApprovalPlaceholder(
  method: string,
  params: Record<string, unknown> | undefined,
  ctx: CodexEmitCtx,
): void {
  const reason = asString(params?.reason);
  const summary = reason ? ` (${reason})` : '';
  emitTextBlock(
    ctx,
    'text',
    `approval-${method}-${ctx.blockIndexRef.value}`,
    `\n\n---\nCodex approval bridge is not wired for ${method}${summary}.`,
  );
}

// ─── handleItemStarted ────────────────────────────────────────────────────────

interface ItemCompletedCtx {
  ctx: CodexEmitCtx;
  childParent: { parentBlockIndex: number; parentToolName: string } | undefined;
  threadId: string | undefined;
  itemId: string;
  item: Record<string, unknown> | null;
}

function handleCommandStarted(args: ItemCompletedCtx): void {
  const { ctx, childParent, threadId, itemId, item } = args;
  const command = asString(item?.command) || asString(item?.commandLine);
  if (childParent) {
    emitChildCommand({
      ctx,
      parent: childParent,
      itemKey: `${threadId}:${itemId}`,
      status: 'running',
      command,
    });
    return;
  }
  emitCommand(ctx, itemId, 'running', command);
}

export function handleItemStarted(
  params: Record<string, unknown> | undefined,
  ctx: CodexEmitCtx,
): void {
  const item = extractItem(params);
  const itemType = extractItemType(item);
  if (!itemType) return;
  const threadId = extractThreadId(params);
  const childParent = resolveParentForThread(ctx, threadId);
  if (itemType === 'collabAgentToolCall' && item) {
    emitCollabTool(ctx, item, 'running', threadId);
    return;
  }
  if (itemType === 'commandExecution') {
    handleCommandStarted({ ctx, childParent, threadId, itemId: extractItemId(item, params), item });
  }
}

// ─── handleItemCompleted helpers ──────────────────────────────────────────────

function handleTranscriptCompleted(args: ItemCompletedCtx, kind: 'text' | 'thinking'): void {
  const { ctx, childParent, threadId, itemId, item } = args;
  const text = asString(item?.text);
  if (childParent && threadId && text) {
    emitChildTranscriptFromText({ ctx, parent: childParent, threadId, itemId, kind, text });
    return;
  }
  if (threadId && resolveRootThreadId(ctx) && threadId !== resolveRootThreadId(ctx)) return;
  if (text) emitRootTranscriptFromText({ ctx, blockType: kind, itemId, text });
}

function handleCommandCompleted(args: ItemCompletedCtx): void {
  const { ctx, childParent, threadId, itemId, item } = args;
  const cmd = asString(item?.command) || asString(item?.commandLine);
  if (childParent) {
    emitChildCommand({
      ctx,
      parent: childParent,
      itemKey: `${threadId}:${itemId}`,
      status: 'complete',
      command: cmd,
      output: asString(item?.aggregatedOutput),
    });
    return;
  }
  emitCommand(ctx, itemId, 'complete', cmd);
}

function handleFileChangeCompleted(args: ItemCompletedCtx): void {
  const { ctx, childParent, threadId, itemId, item } = args;
  if (!item) return;
  if (childParent) emitChildFileChanges(ctx, childParent, `${threadId}:${itemId}`, item);
  else emitFileChanges(ctx, item);
}

export function handleItemCompleted(params: Record<string, unknown> | undefined, ctx: CodexEmitCtx): void {
  const item = extractItem(params);
  const itemType = extractItemType(item);
  const threadId = extractThreadId(params);
  const childParent = resolveParentForThread(ctx, threadId);
  const args: ItemCompletedCtx = { ctx, childParent, threadId, itemId: extractItemId(item, params), item };
  if (itemType === 'agentMessage') { handleTranscriptCompleted(args, 'text'); return; }
  if (itemType === 'reasoning') { handleTranscriptCompleted(args, 'thinking'); return; }
  if (itemType === 'collabAgentToolCall' && item) { emitCollabTool(ctx, item, 'complete', threadId); return; }
  if (itemType === 'commandExecution') { handleCommandCompleted(args); return; }
  if (itemType === 'fileChange') handleFileChangeCompleted(args);
}

// ─── handleTextDelta ──────────────────────────────────────────────────────────

interface ChildTextDeltaArgs {
  ctx: CodexEmitCtx;
  parent: { parentBlockIndex: number; parentToolName: string };
  threadId: string;
  params: Record<string, unknown>;
  blockType: 'text' | 'thinking';
}

function handleChildTextDelta(args: ChildTextDeltaArgs): void {
  const { ctx, parent, threadId, params, blockType } = args;
  const itemId = asString(params.itemId) || 'stream-item';
  const delta = asString(params.delta) || asString(params.text);
  if (!delta) return;
  emitChildTranscriptFromText({
    ctx,
    parent,
    threadId,
    itemId,
    kind: blockType,
    text: delta,
    incremental: true,
    contentIndex: typeof params.contentIndex === 'number' ? params.contentIndex : undefined,
  });
}

function isNonRootThread(ctx: CodexEmitCtx, threadId: string | undefined): boolean {
  if (!threadId) return false;
  const rootId = resolveRootThreadId(ctx);
  return Boolean(rootId) && threadId !== rootId;
}

function extractDelta(params: Record<string, unknown> | undefined): string | undefined {
  return asString(params?.delta) ?? asString(params?.text);
}

export function handleTextDelta(
  params: Record<string, unknown> | undefined,
  ctx: CodexEmitCtx,
  blockType: 'text' | 'thinking',
): void {
  const threadId = extractThreadId(params);
  const childParent = resolveParentForThread(ctx, threadId);
  const delta = extractDelta(params);
  if (!delta) return;
  if (childParent && threadId) {
    handleChildTextDelta({ ctx, parent: childParent, threadId, params: params ?? {}, blockType });
    return;
  }
  if (isNonRootThread(ctx, threadId)) return;
  const itemId = asString(params?.itemId) ?? 'stream-item';
  emitRootTranscriptFromText({ ctx, blockType, itemId, text: delta, incremental: true });
}

// ─── buildCodexAppServerEventMapper ──────────────────────────────────────────

function buildCtx(sink: ProviderProgressSink, sessionRef: SessionRef): CodexEmitCtx {
  return {
    sink, sessionRef, blockIndexRef: { value: 0 }, rootThreadId: sessionRef.sessionId,
    commandBlocks: new Map(), collabBlocks: new Map(), childThreadParents: new Map(),
    childCommandBlocks: new Map(), childTranscriptLengths: new Map(),
    rootTranscriptLengths: new Map(), textBlocks: new Map(), thinkingBlocks: new Map(),
  };
}

function handleTurnCompleted(
  params: Record<string, unknown> | undefined,
): { inputTokens: number; outputTokens: number } | undefined {
  const turn = asRecord(params?.turn);
  const usage = asRecord(params?.usage) || asRecord(turn?.usage);
  if (!usage) return undefined;
  return {
    inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
    outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
  };
}

function dispatchTextDelta(message: CodexAppServerMessage, ctx: CodexEmitCtx): boolean {
  if (message.method === 'item/agentMessage/delta') {
    handleTextDelta(message.params, ctx, 'text');
    return true;
  }
  if (message.method === 'item/reasoning/delta' || message.method === 'item/reasoning/textDelta') {
    handleTextDelta(message.params, ctx, 'thinking');
    return true;
  }
  return false;
}

function handleThreadStartedMsg(
  message: CodexAppServerMessage,
  ctx: CodexEmitCtx,
  sessionRef: SessionRef,
): void {
  ctx.rootThreadId ??= sessionRef.sessionId;
  handleThreadStarted(message.params, sessionRef);
  ctx.rootThreadId ??= sessionRef.sessionId;
}

function dispatchMessage(
  message: CodexAppServerMessage,
  ctx: CodexEmitCtx,
  sessionRef: SessionRef,
  setUsage: (u: { inputTokens: number; outputTokens: number }) => void,
): void {
  if (!message.method) return;
  if (message.method === 'thread/started') {
    handleThreadStartedMsg(message, ctx, sessionRef);
    return;
  }
  if (message.method === 'item/started') {
    handleItemStarted(message.params, ctx);
    return;
  }
  if (message.method === 'item/completed') {
    handleItemCompleted(message.params, ctx);
    return;
  }
  if (dispatchTextDelta(message, ctx)) return;
  if (message.method.endsWith('/requestApproval')) {
    emitApprovalPlaceholder(message.method, message.params, ctx);
    return;
  }
  if (message.method === 'turn/completed') {
    const usage = handleTurnCompleted(message.params);
    if (usage) setUsage(usage);
  }
}

function makeHandle(
  ctx: CodexEmitCtx,
  sessionRef: SessionRef,
  setUsage: (u: { inputTokens: number; outputTokens: number }) => void,
): (message: CodexAppServerMessage) => void {
  return (msg: CodexAppServerMessage): void => dispatchMessage(msg, ctx, sessionRef, setUsage);
}

export function buildCodexAppServerEventMapper(
  sink: ProviderProgressSink,
  sessionRef: SessionRef,
): {
  getNextBlockIndex: () => number;
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined;
  handle: (message: CodexAppServerMessage) => void;
} {
  const ctx = buildCtx(sink, sessionRef);
  let lastUsage: { inputTokens: number; outputTokens: number } | undefined;
  const handle = makeHandle(ctx, sessionRef, (u) => {
    lastUsage = u;
  });
  return {
    getNextBlockIndex: () => ctx.blockIndexRef.value,
    getUsage: () => lastUsage,
    handle,
  };
}
