import { describe, expect, it, vi } from 'vitest';

import {
  CodexAppServerFramingParser,
  encodeCodexAppServerMessage,
} from './codexAppServerFraming';

describe('CodexAppServerFramingParser', () => {
  it('buffers partial NDJSON messages across chunks', () => {
    const parser = new CodexAppServerFramingParser<{ id: number }>();

    expect(parser.push('{"id":1')).toEqual([]);
    expect(parser.push('}\n{"id":2}\n')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('flushes a trailing buffered line on close', () => {
    const parser = new CodexAppServerFramingParser<{ id: number }>();

    parser.push('{"id":3}');

    expect(parser.flush()).toEqual([{ id: 3 }]);
  });

  it('reports malformed lines and keeps parsing later messages', () => {
    const onInvalidMessage = vi.fn();
    const parser = new CodexAppServerFramingParser<{ id: number }>({ onInvalidMessage });

    const messages = parser.push('{"id":1}\n{bad json}\n{"id":2}\n');

    expect(messages).toEqual([{ id: 1 }, { id: 2 }]);
    expect(onInvalidMessage).toHaveBeenCalledTimes(1);
  });

  it('encodes outbound messages as NDJSON', () => {
    expect(encodeCodexAppServerMessage({ hello: 'world' })).toBe('{"hello":"world"}\n');
  });
});
