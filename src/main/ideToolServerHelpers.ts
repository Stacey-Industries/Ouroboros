/**
 * ideToolServerHelpers.ts — Pure helper functions for the IDE tool server.
 * These have no side-effects and depend only on net types and ToolResponse shapes.
 */

import net from 'net';

import type { ToolRequest, ToolResponse } from './ideToolServer';

export function createToolErrorResponse(id: string, code: number, message: string): ToolResponse {
  return { id, error: { code, message } };
}

export function writeToolResponse(socket: net.Socket, response: ToolResponse): void {
  socket.write(JSON.stringify(response) + '\n');
}

export function parseToolRequest(line: string): {
  request?: ToolRequest;
  errorResponse?: ToolResponse;
} {
  try {
    const request = JSON.parse(line) as ToolRequest;
    if (request.id && request.method) return { request };
    return {
      errorResponse: createToolErrorResponse(
        request.id || 'unknown',
        -32600,
        'Invalid request: missing id or method',
      ),
    };
  } catch {
    return {
      errorResponse: createToolErrorResponse('unknown', -32700, 'Parse error: invalid JSON'),
    };
  }
}

export function formatAddress(address: string | net.AddressInfo | null): string | null {
  if (!address) return null;
  if (typeof address === 'string') return address;
  return `${address.address}:${address.port}`;
}
