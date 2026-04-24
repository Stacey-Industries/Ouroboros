/**
 * codexAppServerEventMapperCtx.ts — Shared context type and low-level emitters.
 *
 * Extracted from codexAppServerEventMapper.ts to keep that file under the
 * 300-line ESLint limit.
 */

import type { createProviderSessionReference, ProviderProgressSink } from './providerAdapter';

type SessionRef = ReturnType<typeof createProviderSessionReference>;

export interface CodexEmitCtx {
  sink: ProviderProgressSink;
  sessionRef: SessionRef;
  blockIndexRef: { value: number };
  rootThreadId?: string;
  commandBlocks: Map<string, number>;
  collabBlocks: Map<string, { blockIndex: number; toolName: string }>;
  childThreadParents: Map<string, { parentBlockIndex: number; parentToolName: string }>;
  childCommandBlocks: Map<
    string,
    { parentBlockIndex: number; parentToolName: string; subToolId: string }
  >;
  childTranscriptLengths: Map<string, number>;
  rootTranscriptLengths: Map<string, number>;
  textBlocks: Map<string, number>;
  thinkingBlocks: Map<string, number>;
}

export function nextBlockIndex(ctx: CodexEmitCtx): number {
  const value = ctx.blockIndexRef.value;
  ctx.blockIndexRef.value += 1;
  return value;
}

export function emitTextBlock(
  ctx: CodexEmitCtx,
  blockType: 'text' | 'thinking',
  key: string,
  delta: string,
): void {
  const blockMap = blockType === 'thinking' ? ctx.thinkingBlocks : ctx.textBlocks;
  const blockIndex = blockMap.get(key) ?? nextBlockIndex(ctx);
  blockMap.set(key, blockIndex);
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: delta,
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: { blockIndex, blockType, textDelta: delta },
  });
}

export function resolveRootThreadId(ctx: CodexEmitCtx): string | undefined {
  return ctx.rootThreadId ?? ctx.sessionRef.sessionId;
}

export function resolveParentForThread(
  ctx: CodexEmitCtx,
  threadId: string | undefined,
): { parentBlockIndex: number; parentToolName: string } | undefined {
  if (!threadId) return undefined;
  const rootThreadId = resolveRootThreadId(ctx);
  if (!rootThreadId || threadId === rootThreadId) return undefined;
  return ctx.childThreadParents.get(threadId);
}

export function emitSubToolActivity(
  ctx: CodexEmitCtx,
  parent: { parentBlockIndex: number; parentToolName: string },
  subTool: {
    name: string;
    status: 'running' | 'complete';
    subToolId: string;
    inputSummary?: string;
    filePath?: string;
    output?: string;
  },
): void {
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: '',
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex: parent.parentBlockIndex,
      blockType: 'tool_use',
      toolActivity: {
        name: parent.parentToolName,
        status: 'running',
        subToolActivity: subTool,
      },
    },
  });
}

export function emitSubAgentMessage(
  ctx: CodexEmitCtx,
  parent: { parentBlockIndex: number; parentToolName: string },
  message: {
    entryId: string;
    subAgentId: string;
    label?: string;
    kind: 'text' | 'thinking';
    textDelta: string;
  },
): void {
  if (!message.textDelta) return;
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: '',
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex: parent.parentBlockIndex,
      blockType: 'tool_use',
      toolActivity: {
        name: parent.parentToolName,
        status: 'running',
        subAgentMessage: message,
      },
    },
  });
}

export function bindChildThreadsToParent(
  ctx: CodexEmitCtx,
  parent: { parentBlockIndex: number; parentToolName: string },
  receiverThreadIds: string[],
): void {
  for (const receiverThreadId of receiverThreadIds) {
    ctx.childThreadParents.set(receiverThreadId, parent);
  }
}

export function emitChildTranscriptFromText(args: {
  ctx: CodexEmitCtx;
  parent: { parentBlockIndex: number; parentToolName: string };
  threadId: string;
  itemId: string;
  kind: 'text' | 'thinking';
  text: string;
  contentIndex?: number;
  incremental?: boolean;
}): void {
  const suffix = args.contentIndex != null ? `:${args.contentIndex}` : '';
  const entryId = `${args.threadId}:${args.itemId}:${args.kind}${suffix}`;
  const previousLength = args.ctx.childTranscriptLengths.get(entryId) ?? 0;
  const delta = args.incremental ? args.text : args.text.slice(previousLength);
  if (!delta) return;
  args.ctx.childTranscriptLengths.set(
    entryId,
    args.incremental ? previousLength + delta.length : args.text.length,
  );
  const label = args.threadId.length > 12 ? `${args.threadId.slice(0, 8)}...` : args.threadId;
  emitSubAgentMessage(args.ctx, args.parent, {
    entryId,
    subAgentId: args.threadId,
    label,
    kind: args.kind,
    textDelta: delta,
  });
}

export function emitRootTranscriptFromText(args: {
  blockType: 'text' | 'thinking';
  ctx: CodexEmitCtx;
  incremental?: boolean;
  itemId: string;
  text: string;
}): void {
  const entryId = `${args.blockType}:${args.itemId}`;
  const previousLength = args.ctx.rootTranscriptLengths.get(entryId) ?? 0;
  const delta = args.incremental ? args.text : args.text.slice(previousLength);
  if (!delta) return;
  args.ctx.rootTranscriptLengths.set(
    entryId,
    args.incremental ? previousLength + delta.length : args.text.length,
  );
  emitTextBlock(args.ctx, args.blockType, args.itemId, delta);
}
