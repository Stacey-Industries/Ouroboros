import log from '../../logger';
import type { ProviderProgressSink, createProviderSessionReference } from './providerAdapter';

type SessionRef = ReturnType<typeof createProviderSessionReference>;

export interface CodexAppServerMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

interface CodexEmitCtx {
  sink: ProviderProgressSink;
  sessionRef: SessionRef;
  blockIndexRef: { value: number };
  commandBlocks: Map<string, number>;
  textBlocks: Map<string, number>;
  thinkingBlocks: Map<string, number>;
}

function nextBlockIndex(ctx: CodexEmitCtx): number {
  const value = ctx.blockIndexRef.value;
  ctx.blockIndexRef.value += 1;
  return value;
}

function emitTextBlock(
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

function summarizeCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  return command.length > 200 ? `${command.slice(0, 197)}...` : command;
}

function mapFileChangeKindToTool(kind: string | undefined): 'Edit' | 'Write' {
  return kind === 'add' || kind === 'create' || kind === 'write' ? 'Write' : 'Edit';
}

function summarizeFileChange(kind: string | undefined): string | undefined {
  switch (kind) {
    case 'add':
    case 'create':
      return 'Created file';
    case 'delete':
    case 'remove':
      return 'Deleted file';
    case 'rename':
      return 'Renamed file';
    case 'write':
      return 'Wrote file';
    case 'modify':
    case 'update':
      return 'Updated file';
    default:
      return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractItem(params: Record<string, unknown> | undefined): Record<string, unknown> | null {
  return asRecord(params?.item);
}

function extractItemId(item: Record<string, unknown> | null, params?: Record<string, unknown>): string {
  return (
    asString(item?.id) ||
    asString(params?.itemId) ||
    asString(params?.callId) ||
    asString(params?.id) ||
    'unknown-item'
  );
}

function extractItemType(item: Record<string, unknown> | null): string | undefined {
  return asString(item?.type);
}

function emitCommand(
  ctx: CodexEmitCtx,
  itemId: string,
  status: 'complete' | 'running',
  command: string | undefined,
): void {
  const blockIndex = status === 'running'
    ? nextBlockIndex(ctx)
    : ctx.commandBlocks.get(itemId) ?? nextBlockIndex(ctx);
  if (status === 'running') ctx.commandBlocks.set(itemId, blockIndex);
  if (status === 'complete') ctx.commandBlocks.delete(itemId);
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: '',
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex,
      blockType: 'tool_use',
      toolActivity: { name: 'Bash', status, inputSummary: summarizeCommand(command) },
    },
  });
}

function emitFileChanges(ctx: CodexEmitCtx, item: Record<string, unknown>): void {
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

function handleThreadStarted(params: Record<string, unknown> | undefined, sessionRef: SessionRef): void {
  const thread = asRecord(params?.thread);
  const threadId = asString(thread?.id) || asString(params?.threadId);
  if (!threadId) return;
  sessionRef.sessionId = threadId;
  log.info(`[codex-diag] thread/started → captured thread_id=${threadId}`);
}

function handleItemStarted(params: Record<string, unknown> | undefined, ctx: CodexEmitCtx): void {
  const item = extractItem(params);
  const itemType = extractItemType(item);
  if (!itemType) return;
  const itemId = extractItemId(item, params);
  if (itemType === 'commandExecution') {
    emitCommand(ctx, itemId, 'running', asString(item?.command) || asString(item?.commandLine));
  }
}

function handleItemCompleted(params: Record<string, unknown> | undefined, ctx: CodexEmitCtx): void {
  const item = extractItem(params);
  const itemType = extractItemType(item);
  const itemId = extractItemId(item, params);
  if (itemType === 'agentMessage') {
    const text = asString(item?.text);
    if (text) emitTextBlock(ctx, 'text', itemId, text);
    return;
  }
  if (itemType === 'reasoning') {
    const text = asString(item?.text);
    if (text) emitTextBlock(ctx, 'thinking', itemId, text);
    return;
  }
  if (itemType === 'commandExecution') {
    emitCommand(ctx, itemId, 'complete', asString(item?.command) || asString(item?.commandLine));
    return;
  }
  if (itemType === 'fileChange') emitFileChanges(ctx, item);
}

function handleTextDelta(
  params: Record<string, unknown> | undefined,
  ctx: CodexEmitCtx,
  blockType: 'text' | 'thinking',
): void {
  const itemId = asString(params?.itemId) || 'stream-item';
  const delta = asString(params?.delta) || asString(params?.text);
  if (!delta) return;
  emitTextBlock(ctx, blockType, itemId, delta);
}

export function buildCodexAppServerEventMapper(
  sink: ProviderProgressSink,
  sessionRef: SessionRef,
): {
  getNextBlockIndex: () => number;
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined;
  handle: (message: CodexAppServerMessage) => void;
} {
  const ctx: CodexEmitCtx = {
    sink,
    sessionRef,
    blockIndexRef: { value: 0 },
    commandBlocks: new Map(),
    textBlocks: new Map(),
    thinkingBlocks: new Map(),
  };
  let lastUsage: { inputTokens: number; outputTokens: number } | undefined;

  const handle = (message: CodexAppServerMessage): void => {
    if (!message.method) return;
    if (message.method === 'thread/started') {
      handleThreadStarted(message.params, sessionRef);
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
    if (message.method === 'item/agentMessage/delta') {
      handleTextDelta(message.params, ctx, 'text');
      return;
    }
    if (message.method === 'item/reasoning/delta') {
      handleTextDelta(message.params, ctx, 'thinking');
      return;
    }
    if (message.method === 'turn/completed') {
      const usage = asRecord(message.params?.usage) || asRecord(asRecord(message.params?.turn)?.usage);
      if (usage) {
        lastUsage = {
          inputTokens:
            (typeof usage.input_tokens === 'number' ? usage.input_tokens : 0) +
            (typeof usage.cached_input_tokens === 'number' ? usage.cached_input_tokens : 0),
          outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
        };
      }
      return;
    }
  };

  return {
    getNextBlockIndex: () => ctx.blockIndexRef.value,
    getUsage: () => lastUsage,
    handle,
  };
}
