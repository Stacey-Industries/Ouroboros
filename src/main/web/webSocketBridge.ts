/**
 * webSocketBridge.ts — JSON-RPC 2.0 ↔ IPC bridge.
 *
 * Parses incoming JSON-RPC messages from WebSocket clients, looks up the
 * corresponding handler in the shared IPC handler registry, calls it with
 * a mock IpcMainInvokeEvent, and returns the result as a JSON-RPC response.
 */

import { WebSocket } from 'ws'

import { getAllActiveWindows } from '../windowManager'
import { ipcHandlerRegistry } from './handlerRegistry'

// ─── Types ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown[]
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// JSON-RPC 2.0 error codes
const ERROR_PARSE = -32700
const ERROR_INVALID_REQUEST = -32600
const ERROR_METHOD_NOT_FOUND = -32601
const ERROR_INTERNAL = -32603

// ─── Mock IPC event ─────────────────────────────────────────────────────────

/**
 * Creates a minimal mock IpcMainInvokeEvent for web clients.
 *
 * Most handlers use `event` only to get the sender window (via event.sender).
 * We return the first active BrowserWindow as the sender, which is safe
 * because web clients share the same workspace context.
 */
function createMockIpcEvent(): Electron.IpcMainInvokeEvent {
  const windows = getAllActiveWindows()
  const win = windows.length > 0 ? windows[0] : null

  // Build a minimal sender shim that satisfies what handlers expect
  const senderShim = win
    ? win.webContents
    : {
        // Fallback shim if no windows are open — should be rare
        id: -1,
        getOwnerBrowserWindow: () => null,
        send: () => {},
      }

  return {
    sender: senderShim,
    // These properties exist on IpcMainInvokeEvent but are rarely used
    processId: process.pid,
    frameId: 0,
    ports: [],
    senderFrame: null as unknown as Electron.WebFrameMain,
  } as unknown as Electron.IpcMainInvokeEvent
}

// ─── Binary encoding ────────────────────────────────────────────────────────

/**
 * Recursively encodes Buffer/Uint8Array values to base64 strings
 * for safe JSON serialization over WebSocket.
 */
function encodeForTransport(value: unknown): unknown {
  if (value === null || value === undefined) return value

  if (Buffer.isBuffer(value)) {
    return { __type: 'Buffer', data: value.toString('base64') }
  }

  if (value instanceof Uint8Array) {
    return { __type: 'Uint8Array', data: Buffer.from(value).toString('base64') }
  }

  if (Array.isArray(value)) {
    return value.map(encodeForTransport)
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = encodeForTransport(v)
    }
    return result
  }

  return value
}

// ─── Message handling ───────────────────────────────────────────────────────

/**
 * Validates that a parsed message conforms to JSON-RPC 2.0 request format.
 */
function isValidJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== 'object' || msg === null) return false
  const obj = msg as Record<string, unknown>
  return (
    obj.jsonrpc === '2.0' &&
    (typeof obj.id === 'number' || typeof obj.id === 'string') &&
    typeof obj.method === 'string'
  )
}

/**
 * Sends a JSON-RPC response to a WebSocket client.
 */
function sendResponse(ws: WebSocket, response: JsonRpcResponse): void {
  if (ws.readyState !== WebSocket.OPEN) return
  try {
    ws.send(JSON.stringify(response))
  } catch (err) {
    console.error('[ws-bridge] Failed to send response:', err)
  }
}

/**
 * Handles an incoming raw WebSocket message.
 * Parses it as JSON-RPC 2.0, routes to the handler registry, and responds.
 */
export function handleJsonRpcMessage(ws: WebSocket, raw: string): void {
  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendResponse(ws, {
      jsonrpc: '2.0',
      id: null,
      error: { code: ERROR_PARSE, message: 'Parse error: invalid JSON' },
    })
    return
  }

  // Validate JSON-RPC structure
  if (!isValidJsonRpcRequest(parsed)) {
    sendResponse(ws, {
      jsonrpc: '2.0',
      id: (parsed as Record<string, unknown>)?.id as string | number ?? null,
      error: { code: ERROR_INVALID_REQUEST, message: 'Invalid JSON-RPC 2.0 request' },
    })
    return
  }

  const request = parsed

  // Look up handler
  const handler = ipcHandlerRegistry.get(request.method)
  if (!handler) {
    sendResponse(ws, {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: ERROR_METHOD_NOT_FOUND,
        message: `Method not found: ${request.method}`,
        data: {
          availableMethods: Array.from(ipcHandlerRegistry.keys()).length,
        },
      },
    })
    return
  }

  // Call handler with mock event + params
  const mockEvent = createMockIpcEvent()
  const params = Array.isArray(request.params) ? request.params : []

  Promise.resolve()
    .then(() => handler(mockEvent, ...params))
    .then((result: unknown) => {
      sendResponse(ws, {
        jsonrpc: '2.0',
        id: request.id,
        result: encodeForTransport(result),
      })
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      console.error(`[ws-bridge] Handler error for ${request.method}:`, message)
      sendResponse(ws, {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ERROR_INTERNAL,
          message: `Handler error: ${message}`,
          data: process.env.NODE_ENV === 'development' ? { stack } : undefined,
        },
      })
    })
}
