/**
 * mcpHostProtocol.ts — IPC message protocol between main process and the
 * McpHost utility process.
 *
 * The McpHost owns only the HTTP/SSE server. All tool list and tool call
 * requests are dispatched back to main via IPC events because the actual
 * tool implementations need access to main-process singletons (graph
 * controller, context layer store) that aren't available in a utility process.
 */

// ── Tool definition (metadata only — handlers stay in main) ──

export interface McpHostToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ── Main → Host: requests ──

export type McpHostRequest =
  | { type: 'start'; requestId: string; workspaceRoot: string; port: number }
  | { type: 'stop'; requestId: string }
  /** Response to a host→main toolList request */
  | { type: 'toolListResponse'; callId: string; tools: McpHostToolDef[] }
  /** Response to a host→main toolCall request */
  | { type: 'toolCallResponse'; callId: string; text: string; isError: boolean }
  /** Error response to a host→main toolCall request */
  | { type: 'toolCallError'; callId: string; message: string };

// ── Host → Main: responses (correlated by requestId) ──

export type McpHostResponse =
  | { type: 'started'; requestId: string; port: number }
  | { type: 'stopped'; requestId: string }
  | { type: 'error'; requestId: string; message: string };

// ── Host → Main: push events (require a response from main) ──

export type McpHostEvent =
  /** Host needs the active tool list (sent on every tools/list JSON-RPC) */
  | { type: 'toolListRequest'; callId: string }
  /** Host needs to invoke a tool (sent on every tools/call JSON-RPC) */
  | { type: 'toolCallRequest'; callId: string; name: string; args: Record<string, unknown> };

// ── Outbound discriminated union ──

export type McpHostOutbound = McpHostResponse | McpHostEvent;

const RESPONSE_TYPES = new Set(['started', 'stopped', 'error']);

export function isResponse(msg: McpHostOutbound): msg is McpHostResponse {
  return RESPONSE_TYPES.has(msg.type);
}

export function isEvent(msg: McpHostOutbound): msg is McpHostEvent {
  return !RESPONSE_TYPES.has(msg.type);
}
