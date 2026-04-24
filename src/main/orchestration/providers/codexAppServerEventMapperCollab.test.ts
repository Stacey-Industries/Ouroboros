import { describe, expect, it } from 'vitest';

import {
  buildCollabSummary,
  emitChildCommand,
  emitChildFileChanges,
  emitCollabStates,
  emitCollabTool,
  emitFileChanges,
  handleThreadStarted,
  mapCollabToolName,
} from './codexAppServerEventMapperCollab';
import type { CodexEmitCtx } from './codexAppServerEventMapperCtx';
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

describe('mapCollabToolName', () => {
  it('maps known tool names to snake_case equivalents', () => {
    expect(mapCollabToolName('spawnAgent')).toBe('spawn_agent');
    expect(mapCollabToolName('sendInput')).toBe('send_input');
    expect(mapCollabToolName('resumeAgent')).toBe('resume_agent');
    expect(mapCollabToolName('wait')).toBe('wait_agent');
    expect(mapCollabToolName('closeAgent')).toBe('close_agent');
  });

  it('returns the original string for unknown tools', () => {
    expect(mapCollabToolName('custom')).toBe('custom');
    expect(mapCollabToolName(undefined)).toBe('agent');
  });
});

describe('buildCollabSummary', () => {
  it('prefers prompt, truncated to 200 chars', () => {
    const long = 'p'.repeat(250);
    const result = buildCollabSummary({ prompt: long });
    expect(result?.length).toBe(200);
  });

  it('falls back to model/reasoningEffort when no prompt', () => {
    expect(buildCollabSummary({ model: 'gpt-5.4', reasoningEffort: 'high' })).toBe(
      'gpt-5.4 / high',
    );
  });

  it('falls back to receiver count when no prompt or model', () => {
    expect(buildCollabSummary({ receiverThreadIds: ['a', 'b'] })).toBe('targets 2 agents');
    expect(buildCollabSummary({ receiverThreadIds: ['a'] })).toBe('targets 1 agent');
  });

  it('returns undefined when no summary information is available', () => {
    expect(buildCollabSummary({})).toBeUndefined();
  });
});

describe('emitCollabStates', () => {
  it('emits one Agent sub-tool event per thread in the union of receiverIds and state keys', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };
    const parent = { parentBlockIndex: 0, parentToolName: 'spawn_agent' };

    emitCollabStates({
      ctx,
      parent,
      itemId: 'collab-1',
      receiverThreadIds: ['thr-a'],
      states: { 'thr-a': { status: 'running', message: 'Working' } },
    });

    expect(events).toHaveLength(1);
    type Ev = {
      contentBlock: { toolActivity: { subToolActivity: { name: string; status: string } } };
    };
    const sub = (events[0] as Ev).contentBlock.toolActivity.subToolActivity;
    expect(sub.name).toBe('Agent');
    expect(sub.status).toBe('running');
  });
});

describe('emitChildCommand', () => {
  it('emits a Bash sub-tool running event and registers the itemKey', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };
    const parent = { parentBlockIndex: 2, parentToolName: 'spawn_agent' };

    emitChildCommand({ ctx, parent, itemKey: 'thr:cmd-1', status: 'running', command: 'ls' });

    expect(events).toHaveLength(1);
    expect(ctx.childCommandBlocks.has('thr:cmd-1')).toBe(true);
    type Ev = { contentBlock: { toolActivity: { subToolActivity: { name: string } } } };
    expect((events[0] as Ev).contentBlock.toolActivity.subToolActivity.name).toBe('Bash');
  });

  it('removes the itemKey on complete and passes output', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };
    const parent = { parentBlockIndex: 2, parentToolName: 'spawn_agent' };

    emitChildCommand({ ctx, parent, itemKey: 'thr:cmd-1', status: 'running', command: 'ls' });
    emitChildCommand({
      ctx,
      parent,
      itemKey: 'thr:cmd-1',
      status: 'complete',
      command: 'ls',
      output: 'file.ts',
    });

    expect(ctx.childCommandBlocks.has('thr:cmd-1')).toBe(false);
    type Ev = { contentBlock: { toolActivity: { subToolActivity: { output?: string } } } };
    expect((events[1] as Ev).contentBlock.toolActivity.subToolActivity.output).toBe('file.ts');
  });
});

describe('emitFileChanges', () => {
  it('emits running+complete pairs for each file change', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitFileChanges(ctx, {
      changes: [{ kind: 'write', path: 'src/index.ts' }],
    });

    expect(events).toHaveLength(2);
    type Ev = { contentBlock: { toolActivity: { status: string; name: string } } };
    expect((events[0] as Ev).contentBlock.toolActivity.status).toBe('running');
    expect((events[1] as Ev).contentBlock.toolActivity.status).toBe('complete');
    expect((events[0] as Ev).contentBlock.toolActivity.name).toBe('Write');
  });

  it('skips entries with no path', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };

    emitFileChanges(ctx, { changes: [{ kind: 'write' }] });

    expect(events).toHaveLength(0);
  });
});

describe('emitChildFileChanges', () => {
  it('emits sub-tool running+complete pairs on the parent block', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.sink = { emit: (e) => void events.push(e) };
    const parent = { parentBlockIndex: 3, parentToolName: 'spawn_agent' };

    emitChildFileChanges(ctx, parent, 'thr:item-1', {
      changes: [{ kind: 'modify', path: 'src/foo.ts' }],
    });

    expect(events).toHaveLength(2);
    type Ev = { contentBlock: { blockIndex: number } };
    expect((events[0] as Ev).contentBlock.blockIndex).toBe(3);
  });
});

describe('emitCollabTool — top-level', () => {
  it('allocates a new block and registers receiver threads', () => {
    const events: unknown[] = [];
    const ctx = makeCtx();
    ctx.rootThreadId = 'thr-root';
    ctx.sessionRef.sessionId = 'thr-root';
    ctx.sink = { emit: (e) => void events.push(e) };

    emitCollabTool(
      ctx,
      { id: 'c1', tool: 'spawnAgent', receiverThreadIds: ['thr-child'], prompt: 'Do X' },
      'running',
      'thr-root',
    );

    expect(events.length).toBeGreaterThan(0);
    type Ev = { contentBlock: { blockIndex: number; toolActivity: { name: string } } };
    const first = (events[0] as Ev).contentBlock;
    expect(first.blockIndex).toBe(0);
    expect(first.toolActivity.name).toBe('spawn_agent');
    expect(ctx.childThreadParents.has('thr-child')).toBe(true);
  });
});

describe('handleThreadStarted', () => {
  it('sets sessionId on the ref when not already set', () => {
    const ref = { sessionId: undefined as string | undefined };
    handleThreadStarted({ thread: { id: 'thr-123' } }, ref);
    expect(ref.sessionId).toBe('thr-123');
  });

  it('does not overwrite an existing sessionId', () => {
    const ref = { sessionId: 'thr-existing' };
    handleThreadStarted({ thread: { id: 'thr-new' } }, ref);
    expect(ref.sessionId).toBe('thr-existing');
  });

  it('does nothing when no threadId is extractable', () => {
    const ref = { sessionId: undefined as string | undefined };
    handleThreadStarted({}, ref);
    expect(ref.sessionId).toBeUndefined();
  });
});
