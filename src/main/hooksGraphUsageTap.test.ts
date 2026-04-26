import { describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { classifyShape, tapGraphUsage } from './hooksGraphUsageTap';
import type { HookPayload } from './hooks';

describe('classifyShape', () => {
  it('classifies bare identifier Grep as symbol', () => {
    expect(classifyShape('Grep', { pattern: 'handleEvent' })).toBe('symbol');
  });

  it('classifies regex Grep as literal', () => {
    expect(classifyShape('Grep', { pattern: 'handle.*Event' })).toBe('literal');
  });

  it('classifies quoted Grep as literal', () => {
    expect(classifyShape('Grep', { pattern: '"some error message"' })).toBe('literal');
  });

  it('returns unknown for empty Grep pattern', () => {
    expect(classifyShape('Grep', { pattern: '' })).toBe('unknown');
    expect(classifyShape('Grep', {})).toBe('unknown');
  });

  it('classifies Read with file_path as literal', () => {
    expect(classifyShape('Read', { file_path: '/src/main/foo.ts' })).toBe('literal');
  });

  it('returns unknown for Read with no file_path', () => {
    expect(classifyShape('Read', {})).toBe('unknown');
  });

  it('returns unknown for non-target tools', () => {
    expect(classifyShape('Edit', { pattern: 'foo' })).toBe('unknown');
  });

  it('returns unknown for missing input', () => {
    expect(classifyShape('Grep', undefined)).toBe('unknown');
  });
});

describe('tapGraphUsage', () => {
  function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
    return {
      type: 'pre_tool_use',
      sessionId: 's1',
      toolName: 'Grep',
      input: { pattern: 'foo' },
      timestamp: Date.now(),
      ...overrides,
    };
  }

  it('does not throw on non-target tools', () => {
    expect(() => tapGraphUsage(makePayload({ toolName: 'Edit' }))).not.toThrow();
  });

  it('does not throw on non-pre_tool_use events', () => {
    expect(() =>
      tapGraphUsage(makePayload({ type: 'post_tool_use' as HookPayload['type'] })),
    ).not.toThrow();
  });

  it('does not throw on Grep payloads', () => {
    expect(() => tapGraphUsage(makePayload())).not.toThrow();
  });

  it('does not throw on Read payloads with file_path', () => {
    expect(() =>
      tapGraphUsage(makePayload({ toolName: 'Read', input: { file_path: '/x' } })),
    ).not.toThrow();
  });
});
