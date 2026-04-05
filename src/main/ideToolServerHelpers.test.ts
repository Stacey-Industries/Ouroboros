import { describe, expect, it, vi } from 'vitest';

import {
  createToolErrorResponse,
  formatAddress,
  parseToolRequest,
  writeToolResponse,
} from './ideToolServerHelpers';

describe('createToolErrorResponse', () => {
  it('returns an object with the given id and error shape', () => {
    const resp = createToolErrorResponse('req-1', -32600, 'Bad request');
    expect(resp.id).toBe('req-1');
    expect(resp.error?.code).toBe(-32600);
    expect(resp.error?.message).toBe('Bad request');
    expect(resp.result).toBeUndefined();
  });
});

describe('parseToolRequest', () => {
  it('parses a valid request line', () => {
    const line = JSON.stringify({ id: 'abc', method: 'ide.getOpenFiles', params: {} });
    const { request, errorResponse } = parseToolRequest(line);
    expect(errorResponse).toBeUndefined();
    expect(request?.id).toBe('abc');
    expect(request?.method).toBe('ide.getOpenFiles');
  });

  it('returns a parse-error response for invalid JSON', () => {
    const { request, errorResponse } = parseToolRequest('{not json}');
    expect(request).toBeUndefined();
    expect(errorResponse?.error?.code).toBe(-32700);
  });

  it('returns an invalid-request response when id or method is missing', () => {
    const line = JSON.stringify({ id: 'x' }); // missing method
    const { request, errorResponse } = parseToolRequest(line);
    expect(request).toBeUndefined();
    expect(errorResponse?.error?.code).toBe(-32600);
  });
});

describe('formatAddress', () => {
  it('returns null for null input', () => {
    expect(formatAddress(null)).toBeNull();
  });

  it('returns the string directly for string input', () => {
    expect(formatAddress('\\\\.\\pipe\\ouroboros-tools')).toBe('\\\\.\\pipe\\ouroboros-tools');
  });

  it('formats an AddressInfo object as address:port', () => {
    expect(formatAddress({ address: '127.0.0.1', port: 9000, family: 'IPv4' })).toBe(
      '127.0.0.1:9000',
    );
  });
});

describe('writeToolResponse', () => {
  it('writes JSON + newline to the socket', () => {
    const mockSocket = { write: vi.fn() };
    const response = { id: 'r1', result: [1, 2, 3] };
    writeToolResponse(mockSocket as never, response);
    expect(mockSocket.write).toHaveBeenCalledOnce();
    const written: string = mockSocket.write.mock.calls[0][0];
    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written.trim())).toEqual(response);
  });
});
