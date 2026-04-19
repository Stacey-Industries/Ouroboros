/**
 * AgentChatStreamingReducers.tool.test.ts — Unit tests for tool-activity block helpers.
 */

import { describe, expect, it } from 'vitest';

import type { AgentChatContentBlock, AgentChatStreamChunk } from '../../types/electron-agent-chat';
import {
  applySubToolDelta,
  applyToolActivityLegacy,
  applyToolActivityStructured,
  ensureBlockCapacity,
  generateBlockId,
} from './AgentChatStreamingReducers.tool';

// ── generateBlockId ───────────────────────────────────────────────────────────

describe('generateBlockId', () => {
  it('returns a string starting with "block-"', () => {
    expect(generateBlockId()).toMatch(/^block-/);
  });

  it('returns unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateBlockId()));
    expect(ids.size).toBe(20);
  });
});

// ── ensureBlockCapacity ───────────────────────────────────────────────────────

describe('ensureBlockCapacity', () => {
  it('does nothing when array is already large enough', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'text', content: 'a' },
      { kind: 'text', content: 'b' },
    ];
    ensureBlockCapacity(blocks, 1);
    expect(blocks).toHaveLength(2);
  });

  it('pads with empty text blocks up to the required index', () => {
    const blocks: AgentChatContentBlock[] = [];
    ensureBlockCapacity(blocks, 2);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.kind === 'text' && b.content === '')).toBe(true);
  });

  it('pads exactly one slot when needed', () => {
    const blocks: AgentChatContentBlock[] = [{ kind: 'text', content: 'x' }];
    ensureBlockCapacity(blocks, 1);
    expect(blocks).toHaveLength(2);
  });
});

// ── applySubToolDelta ─────────────────────────────────────────────────────────

describe('applySubToolDelta', () => {
  function makeToolBlock(): AgentChatContentBlock {
    return { kind: 'tool_use', tool: 'Task', status: 'running', blockId: 'b1' };
  }

  it('appends a running subTool', () => {
    const blocks: AgentChatContentBlock[] = [makeToolBlock()];
    const result = applySubToolDelta(blocks, 0, {
      name: 'Read', status: 'running', subToolId: 'st-1',
    });
    expect(result[0].kind).toBe('tool_use');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).subTools).toHaveLength(1);
  });

  it('updates an existing subTool by subToolId', () => {
    const blocks: AgentChatContentBlock[] = [{
      kind: 'tool_use', tool: 'Task', status: 'running', blockId: 'b1',
      subTools: [{ name: 'Read', status: 'running', subToolId: 'st-1' }],
    }];
    const result = applySubToolDelta(blocks, 0, {
      name: 'Read', status: 'complete', subToolId: 'st-1', output: 'done',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).subTools[0].status).toBe('complete');
  });

  it('returns unchanged array when block at index is not tool_use', () => {
    const blocks: AgentChatContentBlock[] = [{ kind: 'text', content: 'hi' }];
    const result = applySubToolDelta(blocks, 0, {
      name: 'Read', status: 'running', subToolId: 'st-1',
    });
    expect(result[0].kind).toBe('text');
  });

  it('does not mutate the input array', () => {
    const blocks: AgentChatContentBlock[] = [makeToolBlock()];
    applySubToolDelta(blocks, 0, { name: 'Read', status: 'running', subToolId: 'st-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((blocks[0] as any).subTools).toBeUndefined();
  });
});

// ── applyToolActivityStructured ───────────────────────────────────────────────

describe('applyToolActivityStructured', () => {
  function makeChunk(
    overrides: Partial<AgentChatStreamChunk> = {},
  ): AgentChatStreamChunk {
    return {
      type: 'tool_activity',
      messageId: 'm1',
      blockIndex: 0,
      toolActivity: { name: 'Edit', status: 'running' },
      ...overrides,
    };
  }

  it('inserts a running tool_use block at blockIndex', () => {
    const result = applyToolActivityStructured([], makeChunk());
    expect(result[0].kind).toBe('tool_use');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).status).toBe('running');
  });

  it('updates an existing tool_use block on completion', () => {
    const existing: AgentChatContentBlock[] = [{
      kind: 'tool_use', tool: 'Edit', status: 'running', blockId: 'b1',
    }];
    const chunk = makeChunk({
      blockIndex: 0,
      toolActivity: { name: 'Edit', status: 'complete', output: 'done' },
    });
    const result = applyToolActivityStructured(existing, chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).status).toBe('complete');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).output).toBe('done');
  });

  it('delegates to applySubToolDelta when subTool is present', () => {
    const existing: AgentChatContentBlock[] = [{
      kind: 'tool_use', tool: 'Task', status: 'running', blockId: 'b1',
    }];
    const chunk = makeChunk({
      blockIndex: 0,
      toolActivity: {
        name: 'Task', status: 'running',
        subTool: { name: 'Read', status: 'running', subToolId: 'st-1' },
      },
    });
    const result = applyToolActivityStructured(existing, chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).subTools).toHaveLength(1);
  });
});

// ── applyToolActivityLegacy ───────────────────────────────────────────────────

describe('applyToolActivityLegacy', () => {
  function makeChunk(
    overrides: Partial<AgentChatStreamChunk> = {},
  ): AgentChatStreamChunk {
    return {
      type: 'tool_activity',
      messageId: 'm1',
      toolActivity: { name: 'Write', status: 'running' },
      ...overrides,
    };
  }

  it('appends a running tool_use block when status is running', () => {
    const { blocks } = applyToolActivityLegacy([], makeChunk());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('tool_use');
  });

  it('updates the last matching running tool_use block on completion', () => {
    const sealed: AgentChatContentBlock[] = [{
      kind: 'tool_use', tool: 'Write', status: 'running', blockId: 'b1',
    }];
    const chunk = makeChunk({
      toolActivity: { name: 'Write', status: 'complete', output: 'written' },
    });
    const { blocks } = applyToolActivityLegacy(sealed, chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((blocks[0] as any).status).toBe('complete');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((blocks[0] as any).output).toBe('written');
  });

  it('leaves unrelated tool blocks untouched on completion', () => {
    const sealed: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Read', status: 'running', blockId: 'b1' },
      { kind: 'tool_use', tool: 'Write', status: 'running', blockId: 'b2' },
    ];
    const chunk = makeChunk({
      toolActivity: { name: 'Write', status: 'complete', output: 'ok' },
    });
    const { blocks } = applyToolActivityLegacy(sealed, chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((blocks[0] as any).status).toBe('running');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((blocks[1] as any).status).toBe('complete');
  });
});
