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
    mapper.handle({ method: 'item/agentMessage/delta', params: { itemId: 'msg-1', delta: 'Hello' } });
    mapper.handle({ method: 'item/agentMessage/delta', params: { itemId: 'msg-1', delta: ' world' } });
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
    expect(mapper.getUsage()).toEqual({ inputTokens: 125, outputTokens: 12 });
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
});
