import { describe, expect, it } from 'vitest';

import { buildCodexAppServerEventMapper } from './codexAppServerEventMapper';
import { createProviderSessionReference, type ProviderProgressSink } from './providerAdapter';

function makeSink(events: unknown[]): ProviderProgressSink {
  return {
    emit: (event) => {
      events.push(event);
    },
  };
}

describe('codexAppServerEventMapper', () => {
  it('captures thread ids and maps streamed agent text deltas', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', {});
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({ method: 'thread/started', params: { thread: { id: 'thr-123' } } });
    mapper.handle({
      method: 'item/agentMessage/delta',
      params: { itemId: 'msg-1', delta: 'Hello' },
    });
    mapper.handle({
      method: 'item/agentMessage/delta',
      params: { itemId: 'msg-1', delta: ' world' },
    });
    mapper.handle({
      method: 'turn/completed',
      params: { usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 12 } },
    });

    expect(sessionRef.sessionId).toBe('thr-123');
    expect(events).toHaveLength(2);
    expect(events[0].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'text',
      textDelta: 'Hello',
    });
    expect(events[1].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'text',
      textDelta: ' world',
    });
    expect(mapper.getUsage()).toEqual({ inputTokens: 100, outputTokens: 12 });
  });

  it('does not duplicate completed agent text that was already streamed', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', {});
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({
      method: 'item/agentMessage/delta',
      params: { itemId: 'msg-1', delta: 'Hello' },
    });
    mapper.handle({
      method: 'item/agentMessage/delta',
      params: { itemId: 'msg-1', delta: ' world' },
    });
    mapper.handle({
      method: 'item/completed',
      params: { item: { id: 'msg-1', type: 'agentMessage', text: 'Hello world' } },
    });

    expect(events.map((event) => (event.contentBlock as { textDelta: string }).textDelta)).toEqual([
      'Hello',
      ' world',
    ]);
  });

  it('maps command execution and file changes to tool_use blocks', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', {});
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({
      method: 'item/started',
      params: { item: { id: 'cmd-1', type: 'commandExecution', command: 'npm test' } },
    });
    mapper.handle({
      method: 'item/completed',
      params: { item: { id: 'cmd-1', type: 'commandExecution', command: 'npm test' } },
    });
    mapper.handle({
      method: 'item/completed',
      params: {
        item: {
          id: 'file-1',
          type: 'fileChange',
          changes: [{ kind: 'write', path: 'src/index.ts' }],
        },
      },
    });

    expect(events).toHaveLength(4);
    expect(events[0].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: { name: 'Bash', status: 'running', inputSummary: 'npm test' },
    });
    expect(events[1].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: { name: 'Bash', status: 'complete', inputSummary: 'npm test' },
    });
    expect(events[2].contentBlock).toEqual({
      blockIndex: 1,
      blockType: 'tool_use',
      toolActivity: {
        name: 'Write',
        status: 'running',
        filePath: 'src/index.ts',
        inputSummary: 'Wrote file',
      },
    });
  });

  it('surfaces approval requests as placeholder text blocks', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', {});
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({
      id: 61,
      method: 'item/permissions/requestApproval',
      params: { reason: 'Need write access' },
    });

    expect(events).toHaveLength(1);
    const block = events[0].contentBlock as Record<string, unknown>;
    expect(block.blockType).toBe('text');
    expect(block.textDelta).toContain('approval bridge is not wired');
  });

  it('maps collabAgentToolCall items and child-thread tools into nested sub-tool activity', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', { sessionId: 'thr-root' });
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({
      method: 'item/started',
      params: {
        threadId: 'thr-root',
        item: {
          id: 'collab-1',
          type: 'collabAgentToolCall',
          tool: 'spawnAgent',
          status: 'inProgress',
          senderThreadId: 'thr-root',
          receiverThreadIds: ['thr-child'],
          prompt: 'Inspect src/main for orchestration regressions',
          model: 'gpt-5.4',
          reasoningEffort: 'high',
          agentsStates: {
            'thr-child': { status: 'running', message: 'Scanning provider files' },
          },
        },
      },
    });
    mapper.handle({
      method: 'item/started',
      params: {
        threadId: 'thr-child',
        item: { id: 'cmd-1', type: 'commandExecution', command: 'rg orchestration src/main' },
      },
    });
    mapper.handle({
      method: 'item/completed',
      params: {
        threadId: 'thr-child',
        item: {
          id: 'cmd-1',
          type: 'commandExecution',
          command: 'rg orchestration src/main',
          aggregatedOutput: 'src/main/orchestration/providers/codexAppServerEventMapper.ts:1:...',
        },
      },
    });
    mapper.handle({
      method: 'item/completed',
      params: {
        threadId: 'thr-root',
        item: {
          id: 'collab-1',
          type: 'collabAgentToolCall',
          tool: 'spawnAgent',
          status: 'completed',
          senderThreadId: 'thr-root',
          receiverThreadIds: ['thr-child'],
          prompt: 'Inspect src/main for orchestration regressions',
          agentsStates: {
            'thr-child': { status: 'completed', message: 'Done' },
          },
        },
      },
    });

    expect(events).toHaveLength(6);
    expect(events[0].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        inputSummary: 'Inspect src/main for orchestration regressions',
      },
    });
    expect(events[1].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        subToolActivity: {
          name: 'Agent',
          status: 'running',
          subToolId: 'collab-1:state:thr-child',
          inputSummary: 'thr-child: Scanning provider files',
        },
      },
    });
    expect(events[2].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        subToolActivity: {
          name: 'Bash',
          status: 'running',
          subToolId: 'thr-child:cmd-1:command',
          inputSummary: 'rg orchestration src/main',
        },
      },
    });
    expect(events[3].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        subToolActivity: {
          name: 'Bash',
          status: 'complete',
          subToolId: 'thr-child:cmd-1:command',
          inputSummary: 'rg orchestration src/main',
          output: 'src/main/orchestration/providers/codexAppServerEventMapper.ts:1:...',
        },
      },
    });
    expect(events[4].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'complete',
        inputSummary: 'Inspect src/main for orchestration regressions',
      },
    });
    expect(events[5].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        subToolActivity: {
          name: 'Agent',
          status: 'complete',
          subToolId: 'collab-1:state:thr-child',
          inputSummary: 'thr-child: Done',
        },
      },
    });
  });

  it('does not replace the root thread id when subagent threads start', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', { sessionId: 'thr-root' });
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({ method: 'thread/started', params: { thread: { id: 'thr-child' } } });

    expect(sessionRef.sessionId).toBe('thr-root');
    expect(events).toHaveLength(0);
  });

  it('maps child-thread text and thinking deltas into nested transcript activity', () => {
    const events: Array<Record<string, unknown>> = [];
    const sessionRef = createProviderSessionReference('codex', { sessionId: 'thr-root' });
    const mapper = buildCodexAppServerEventMapper(makeSink(events), sessionRef);

    mapper.handle({
      method: 'item/started',
      params: {
        threadId: 'thr-root',
        item: {
          id: 'collab-1',
          type: 'collabAgentToolCall',
          tool: 'spawnAgent',
          status: 'inProgress',
          senderThreadId: 'thr-root',
          receiverThreadIds: ['thr-child'],
          prompt: 'Investigate the failing reducer test',
        },
      },
    });
    mapper.handle({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thr-child', itemId: 'msg-1', delta: 'Searching reducers...' },
    });
    mapper.handle({
      method: 'item/reasoning/textDelta',
      params: {
        threadId: 'thr-child',
        itemId: 'reason-1',
        contentIndex: 0,
        delta: 'Need reducer context',
      },
    });

    expect(events).toHaveLength(4);
    expect(events[2].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        subAgentMessage: {
          entryId: 'thr-child:msg-1:text',
          subAgentId: 'thr-child',
          label: 'thr-child',
          kind: 'text',
          textDelta: 'Searching reducers...',
        },
      },
    });
    expect(events[3].contentBlock).toEqual({
      blockIndex: 0,
      blockType: 'tool_use',
      toolActivity: {
        name: 'spawn_agent',
        status: 'running',
        subAgentMessage: {
          entryId: 'thr-child:reason-1:thinking:0',
          subAgentId: 'thr-child',
          label: 'thr-child',
          kind: 'thinking',
          textDelta: 'Need reducer context',
        },
      },
    });
  });
});
