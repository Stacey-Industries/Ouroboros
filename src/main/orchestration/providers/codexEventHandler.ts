/**
 * codexEventHandler.ts — Event handler factory for CodexAdapter.
 * Converts Codex exec events into ProviderProgressEvents for the sink.
 */
import log from '../../logger';
import {
  observeToolCallBySession,
  recordTurnEndBySession,
} from '../contextOutcomeObserver';
import { getEditProvenanceStore } from '../editProvenance';
import type {
  CodexAgentMessageItem,
  CodexCommandExecutionItem,
  CodexExecEvent,
  CodexFileChange,
  CodexFileChangeItem,
  CodexItemCompletedEvent,
  CodexItemStartedEvent,
  CodexThreadStartedEvent,
  CodexTurnCompletedEvent,
} from './codexExecRunner';
import type { ProviderProgressSink } from './providerAdapter';
import type { createProviderSessionReference } from './providerAdapter';

type SessionRef = ReturnType<typeof createProviderSessionReference>;

interface CodexEmitCtx {
  sink: ProviderProgressSink;
  sessionRef: SessionRef;
  blockIndexRef: { value: number };
  commandBlocks: Map<string, number>;
}

function summarizeCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  return command.length > 200 ? `${command.slice(0, 197)}...` : command;
}

function mapFileChangeKindToTool(kind: string | undefined): 'Write' | 'Edit' {
  return kind === 'add' || kind === 'create' || kind === 'write' ? 'Write' : 'Edit';
}

function summarizeFileChange(change: CodexFileChange): string | undefined {
  switch (change.kind) {
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

function handleItemStarted(event: CodexItemStartedEvent, ctx: CodexEmitCtx): void {
  if (event.item.type !== 'command_execution') return;
  const item = event.item as CodexCommandExecutionItem;
  const blockIndex = ctx.blockIndexRef.value++;
  ctx.commandBlocks.set(item.id, blockIndex);
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: '',
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex,
      blockType: 'tool_use',
      toolActivity: {
        name: 'Bash',
        status: 'running',
        inputSummary: summarizeCommand(item.command),
      },
    },
  });
}

function handleAgentMessage(item: CodexAgentMessageItem, ctx: CodexEmitCtx): void {
  const text = item.text ?? '';
  if (!text) return;
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: text,
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: { blockIndex: ctx.blockIndexRef.value++, blockType: 'text', textDelta: text },
  });
}

function handleCommandCompleted(item: CodexCommandExecutionItem, ctx: CodexEmitCtx): void {
  const blockIndex = ctx.commandBlocks.get(item.id) ?? ctx.blockIndexRef.value++;
  ctx.commandBlocks.delete(item.id);
  ctx.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: '',
    timestamp: Date.now(),
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex,
      blockType: 'tool_use',
      toolActivity: {
        name: 'Bash',
        status: 'complete',
        inputSummary: summarizeCommand(item.command),
      },
    },
  });
}

function recordCodexEditProvenance(paths: string[]): void {
  const store = getEditProvenanceStore();
  if (!store) return;
  for (const filePath of paths) {
    try {
      store.markAgentEdit(filePath);
    } catch (err) {
      log.warn('[codex:provenance] markAgentEdit failed', err);
    }
  }
}

function observeCodexToolTouches(sessionId: string | undefined, paths: string[]): void {
  if (!sessionId) return;
  for (const filePath of paths) {
    try {
      observeToolCallBySession(sessionId, 'Edit', { file_path: filePath });
    } catch (err) {
      log.warn('[codex:context-outcome] observeToolCallBySession failed', err);
    }
  }
}

function handleFileChangeItem(item: CodexFileChangeItem, ctx: CodexEmitCtx): void {
  const changes = (item.changes ?? []).filter(
    (c): c is CodexFileChange & { path: string } =>
      typeof c.path === 'string' && c.path.trim().length > 0,
  );
  // Wave 53 Phase C — record Codex agent edits alongside Claude Code's hook tap.
  const paths = changes.map((c) => c.path);
  recordCodexEditProvenance(paths);
  // Wave 53 Phase E — Codex doesn't traverse the named-pipe hook, so attribute
  // edit-tool touches to the active context-outcome turn directly.
  observeCodexToolTouches(ctx.sessionRef.sessionId, paths);
  for (const change of changes) {
    const blockIndex = ctx.blockIndexRef.value++;
    const name = mapFileChangeKindToTool(change.kind);
    const inputSummary = summarizeFileChange(change);
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
        toolActivity: { name, status: 'running', filePath: change.path, inputSummary },
      },
    });
    ctx.sink.emit({
      ...base,
      contentBlock: {
        blockIndex,
        blockType: 'tool_use',
        toolActivity: { name, status: 'complete', filePath: change.path, inputSummary },
      },
    });
  }
}

function handleItemCompleted(event: CodexItemCompletedEvent, ctx: CodexEmitCtx): void {
  if (event.item.type === 'agent_message')
    return handleAgentMessage(event.item as CodexAgentMessageItem, ctx);
  if (event.item.type === 'command_execution')
    return handleCommandCompleted(event.item as CodexCommandExecutionItem, ctx);
  if (event.item.type === 'file_change')
    return handleFileChangeItem(event.item as CodexFileChangeItem, ctx);
}

function handleThreadStarted(
  event: CodexThreadStartedEvent,
  sessionRef: SessionRef,
): void {
  if (event.thread_id) {
    sessionRef.sessionId = event.thread_id;
    log.info(`[codex-diag] thread.started → captured thread_id=${event.thread_id}`);
  }
}

function handleTurnCompleted(
  event: CodexTurnCompletedEvent,
  sessionRef: SessionRef,
): { inputTokens: number; outputTokens: number } | undefined {
  // Wave 53 Phase E — flush context outcomes for the just-finished Codex turn.
  if (sessionRef.sessionId) {
    try {
      recordTurnEndBySession(sessionRef.sessionId);
    } catch (err) {
      log.warn('[codex:context-outcome] recordTurnEndBySession failed', err);
    }
  }
  const usage = event.usage;
  if (!usage) return undefined;
  return { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 };
}

export function buildCodexEventHandler(
  sink: ProviderProgressSink,
  sessionRef: SessionRef,
): {
  getNextBlockIndex: () => number;
  handler: (event: CodexExecEvent) => void;
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined;
} {
  const ctx: CodexEmitCtx = {
    sink,
    sessionRef,
    blockIndexRef: { value: 0 },
    commandBlocks: new Map(),
  };
  let lastUsage: { inputTokens: number; outputTokens: number } | undefined;

  const handler = (event: CodexExecEvent): void => {
    if (event.type === 'thread.started')
      return handleThreadStarted(event as CodexThreadStartedEvent, sessionRef);
    if (event.type === 'item.started')
      return handleItemStarted(event as CodexItemStartedEvent, ctx);
    if (event.type === 'item.completed')
      return handleItemCompleted(event as CodexItemCompletedEvent, ctx);
    if (event.type === 'turn.completed') {
      const usage = handleTurnCompleted(event as CodexTurnCompletedEvent, sessionRef);
      if (usage) lastUsage = usage;
    }
  };

  return { getNextBlockIndex: () => ctx.blockIndexRef.value, handler, getUsage: () => lastUsage };
}
