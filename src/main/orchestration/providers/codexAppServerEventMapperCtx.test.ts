import { describe, expect, it } from 'vitest';

import {
  bindChildThreadsToParent,
  type CodexEmitCtx,
  emitChildTranscriptFromText,
  emitRootTranscriptFromText,
  emitSubAgentMessage,
  emitSubToolActivity,
  emitTextBlock,
  nextBlockIndex,
  resolveParentForThread,
  resolveRootThreadId,
} from './codexAppServerEventMapperCtx';
import { createProviderSessionReference } from './providerAdapter';

function makeCtx(): CodexEmitCtx {
  return {
    sink: { emit: () => undefined },
    sessionRef: createProviderSessionReference('codex', {}),
    blockIndexRef: { value: 0 },
    commandBlocks: new Map(),
    collabBlocks: new Map(),
    childThreadParents: new Map(),
    childCommandBlocks: new Map(),
    childTranscriptLengths: new Map(),
    rootTranscriptLengths: new Map(),
    textBlocks: new Map(),
    thinkingBlocks: new Map(),
  };
}

describe('nextBlockIndex', () => {
  it('increments and returns the previous value', () => {
    const ctx = makeCtx();
    expect(nextBlockIndex(ctx)).toBe(0);
    expect(nextBlockIndex(ctx)).toBe(1);
    expect(ctx.blockIndexRef.value).toBe(2);
  });
});

describe('emitTextBlock', () => {
  it('emits a streaming event and reuses the same block index for the same key', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitTextBlock(ctx, 'text', 'item-1', 'Hello');
    emitTextBlock(ctx, 'text', 'item-1', ' world');

    expect(events).toHaveLength(2);
    const b0 = (events[0] as { contentBlock: { blockIndex: number } }).contentBlock;
    const b1 = (events[1] as { contentBlock: { blockIndex: number } }).contentBlock;
    expect(b0.blockIndex).toBe(0);
    expect(b1.blockIndex).toBe(0);
  });

  it('allocates a separate block index for thinking vs text on the same key', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitTextBlock(ctx, 'text', 'item-1', 'A');
    emitTextBlock(ctx, 'thinking', 'item-1', 'B');

    const b0 = (events[0] as { contentBlock: { blockIndex: number } }).contentBlock;
    const b1 = (events[1] as { contentBlock: { blockIndex: number } }).contentBlock;
    expect(b0.blockIndex).toBe(0);
    expect(b1.blockIndex).toBe(1);
  });
});

describe('resolveRootThreadId', () => {
  it('returns rootThreadId when set', () => {
    const ctx = makeCtx();
    ctx.rootThreadId = 'thr-root';
    expect(resolveRootThreadId(ctx)).toBe('thr-root');
  });

  it('falls back to sessionRef.sessionId', () => {
    const ctx = makeCtx();
    ctx.sessionRef.sessionId = 'sess-1';
    expect(resolveRootThreadId(ctx)).toBe('sess-1');
  });
});

describe('resolveParentForThread', () => {
  it('returns undefined for an unknown thread', () => {
    const ctx = makeCtx();
    expect(resolveParentForThread(ctx, 'thr-x')).toBeUndefined();
  });

  it('returns undefined when threadId matches root', () => {
    const ctx = makeCtx();
    ctx.rootThreadId = 'thr-root';
    expect(resolveParentForThread(ctx, 'thr-root')).toBeUndefined();
  });

  it('returns the registered parent for a known child thread', () => {
    const ctx = makeCtx();
    ctx.rootThreadId = 'thr-root';
    const parent = { parentBlockIndex: 3, parentToolName: 'spawn_agent' };
    ctx.childThreadParents.set('thr-child', parent);
    expect(resolveParentForThread(ctx, 'thr-child')).toEqual(parent);
  });
});

describe('emitSubToolActivity', () => {
  it('emits a tool_use event with subToolActivity on the parent block index', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitSubToolActivity(
      ctx,
      { parentBlockIndex: 5, parentToolName: 'spawn_agent' },
      {
        name: 'Bash',
        status: 'running',
        subToolId: 'tool-1',
        inputSummary: 'ls',
      },
    );

    expect(events).toHaveLength(1);
    const block = (events[0] as { contentBlock: Record<string, unknown> }).contentBlock;
    expect(block.blockIndex).toBe(5);
    expect(block.blockType).toBe('tool_use');
    const activity = block.toolActivity as { subToolActivity: { name: string } };
    expect(activity.subToolActivity.name).toBe('Bash');
  });
});

describe('emitSubAgentMessage', () => {
  it('skips emission when textDelta is empty', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitSubAgentMessage(
      ctx,
      { parentBlockIndex: 0, parentToolName: 'spawn_agent' },
      {
        entryId: 'e1',
        subAgentId: 'thr-c',
        kind: 'text',
        textDelta: '',
      },
    );

    expect(events).toHaveLength(0);
  });

  it('emits the message event for non-empty delta', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitSubAgentMessage(
      ctx,
      { parentBlockIndex: 2, parentToolName: 'spawn_agent' },
      {
        entryId: 'e1',
        subAgentId: 'thr-c',
        kind: 'text',
        textDelta: 'hello',
      },
    );

    expect(events).toHaveLength(1);
    type Ev = { contentBlock: { toolActivity: { subAgentMessage: { textDelta: string } } } };
    expect((events[0] as Ev).contentBlock.toolActivity.subAgentMessage.textDelta).toBe('hello');
  });
});

describe('bindChildThreadsToParent', () => {
  it('registers all receiverThreadIds under the given parent', () => {
    const ctx = makeCtx();
    const parent = { parentBlockIndex: 0, parentToolName: 'spawn_agent' };
    bindChildThreadsToParent(ctx, parent, ['thr-a', 'thr-b']);
    expect(ctx.childThreadParents.get('thr-a')).toEqual(parent);
    expect(ctx.childThreadParents.get('thr-b')).toEqual(parent);
  });
});

describe('emitChildTranscriptFromText', () => {
  it('emits only the new slice on repeated non-incremental calls', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };
    const parent = { parentBlockIndex: 0, parentToolName: 'spawn_agent' };

    emitChildTranscriptFromText({
      ctx,
      parent,
      threadId: 'thr-c',
      itemId: 'i1',
      kind: 'text',
      text: 'Hello',
    });
    emitChildTranscriptFromText({
      ctx,
      parent,
      threadId: 'thr-c',
      itemId: 'i1',
      kind: 'text',
      text: 'Hello world',
    });

    type Ev = { contentBlock: { toolActivity: { subAgentMessage: { textDelta: string } } } };
    expect((events[0] as Ev).contentBlock.toolActivity.subAgentMessage.textDelta).toBe('Hello');
    expect((events[1] as Ev).contentBlock.toolActivity.subAgentMessage.textDelta).toBe(' world');
  });
});

describe('emitRootTranscriptFromText', () => {
  it('emits only the new slice on repeated non-incremental calls', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitRootTranscriptFromText({ ctx, blockType: 'text', itemId: 'i1', text: 'Hello' });
    emitRootTranscriptFromText({ ctx, blockType: 'text', itemId: 'i1', text: 'Hello world' });

    type Ev = { contentBlock: { textDelta: string } };
    expect((events[1] as Ev).contentBlock.textDelta).toBe(' world');
  });

  it('emits nothing when there is no new content', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitRootTranscriptFromText({ ctx, blockType: 'text', itemId: 'i1', text: 'Hello' });
    emitRootTranscriptFromText({ ctx, blockType: 'text', itemId: 'i1', text: 'Hello' });

    expect(events).toHaveLength(1);
  });
});
