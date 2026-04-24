import { describe, expect, it } from 'vitest';

import {
  asRecord,
  asString,
  asStringArray,
  extractItem,
  extractItemId,
  extractItemType,
  extractThreadId,
  mapFileChangeKindToTool,
  summarizeCommand,
  summarizeFileChange,
  truncate,
} from './codexAppServerEventMapperShared';

describe('truncate', () => {
  it('returns value unchanged when under max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });
  it('truncates and appends ellipsis when over max', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });
});

describe('asRecord', () => {
  it('returns null for primitives', () => {
    expect(asRecord(null)).toBeNull();
    expect(asRecord('str')).toBeNull();
    expect(asRecord(42)).toBeNull();
  });
  it('returns the object for plain objects', () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });
});

describe('asString', () => {
  it('returns undefined for non-strings and empty strings', () => {
    expect(asString(null)).toBeUndefined();
    expect(asString('')).toBeUndefined();
    expect(asString(42)).toBeUndefined();
  });
  it('returns the string for non-empty strings', () => {
    expect(asString('hello')).toBe('hello');
  });
});

describe('asStringArray', () => {
  it('returns empty array for non-arrays', () => {
    expect(asStringArray(null)).toEqual([]);
    expect(asStringArray('str')).toEqual([]);
  });
  it('filters out non-strings and empty strings', () => {
    expect(asStringArray(['a', '', 1, 'b'])).toEqual(['a', 'b']);
  });
});

describe('extractItem', () => {
  it('returns null when params is undefined', () => {
    expect(extractItem(undefined)).toBeNull();
  });
  it('returns item record when present', () => {
    expect(extractItem({ item: { id: 'x' } })).toEqual({ id: 'x' });
  });
});

describe('extractThreadId', () => {
  it('returns undefined when threadId absent', () => {
    expect(extractThreadId({})).toBeUndefined();
  });
  it('returns threadId string', () => {
    expect(extractThreadId({ threadId: 'thr-1' })).toBe('thr-1');
  });
});

describe('extractItemId', () => {
  it('falls back through item.id, params.itemId, params.callId, params.id', () => {
    expect(extractItemId(null, {})).toBe('unknown-item');
    expect(extractItemId(null, { itemId: 'p1' })).toBe('p1');
    expect(extractItemId({ id: 'item-1' }, {})).toBe('item-1');
  });
});

describe('extractItemType', () => {
  it('returns item type string', () => {
    expect(extractItemType({ type: 'commandExecution' })).toBe('commandExecution');
    expect(extractItemType(null)).toBeUndefined();
  });
});

describe('summarizeCommand', () => {
  it('returns undefined for falsy input', () => {
    expect(summarizeCommand(undefined)).toBeUndefined();
  });
  it('truncates long commands', () => {
    const long = 'x'.repeat(250);
    const result = summarizeCommand(long);
    expect(result?.length).toBe(200);
    expect(result?.endsWith('...')).toBe(true);
  });
});

describe('mapFileChangeKindToTool', () => {
  it('maps add/create/write to Write', () => {
    expect(mapFileChangeKindToTool('add')).toBe('Write');
    expect(mapFileChangeKindToTool('create')).toBe('Write');
    expect(mapFileChangeKindToTool('write')).toBe('Write');
  });
  it('maps everything else to Edit', () => {
    expect(mapFileChangeKindToTool('modify')).toBe('Edit');
    expect(mapFileChangeKindToTool(undefined)).toBe('Edit');
  });
});

describe('summarizeFileChange', () => {
  it('maps known kinds to human strings', () => {
    expect(summarizeFileChange('add')).toBe('Created file');
    expect(summarizeFileChange('delete')).toBe('Deleted file');
    expect(summarizeFileChange('write')).toBe('Wrote file');
    expect(summarizeFileChange('modify')).toBe('Updated file');
    expect(summarizeFileChange('rename')).toBe('Renamed file');
  });
  it('returns undefined for unknown kind', () => {
    expect(summarizeFileChange('unknown')).toBeUndefined();
  });
});
