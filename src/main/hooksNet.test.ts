import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  app: {
    getPath: () => 'C:\\temp',
  },
}));

vi.mock('./web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));

import { processSocketChunk } from './hooksNet';

describe('processSocketChunk', () => {
  it('parses the first payload after auth without duplicating the chunk', () => {
    const payloads: Array<Record<string, unknown>> = [];
    const socket = new EventEmitter() as never;

    const firstChunk =
      '{"token":"auth"}\n{"sessionId":"sess-1","timestamp":1,"type":"session_start"}\n';
    const authLineEnd = firstChunk.indexOf('\n');
    const remaining = firstChunk.slice(authLineEnd + 1);

    const nextBuffer = processSocketChunk({
      socket,
      connId: 62,
      buffer: remaining,
      onPayload: (payload) => payloads.push(payload as unknown as Record<string, unknown>),
    });

    expect(nextBuffer).toBe('');
    expect(payloads).toEqual([
      {
        sessionId: 'sess-1',
        timestamp: 1,
        type: 'session_start',
      },
    ]);
  });
});
