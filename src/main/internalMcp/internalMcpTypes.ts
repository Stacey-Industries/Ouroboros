// Part of the unwired internalMcp module — see index.ts for deprecation notice.

export type InternalMcpTransport = 'sse' | 'stdio';

export interface InternalMcpServerOptions {
  workspaceRoot: string;
  port?: number; // 0 = random (default)
  /**
   * Wave 51 Phase B — selects how Claude Code should connect to the server.
   *   'sse'   (default) writes `{url}` into the spawn's mcpServers entry.
   *   'stdio' writes `{command:'node', args:[<stdio-transport-script>, port]}`.
   * The HTTP server runs either way; stdio is a wrapper subprocess that
   * forwards JSON-RPC frames to the same `/message` endpoint.
   */
  transport?: InternalMcpTransport;
}

export interface InternalMcpServerHandle {
  port: number;
  stop: () => Promise<void>;
}

/**
 * Wave 70 Phase B1: handlers return the MCP `CallToolResult` envelope per
 * spec 2025-11-25 (`modelcontextprotocol.io/specification/2025-11-25/schema`).
 * Pre-Wave-70 handlers returned `Promise<string>` and the standalone server
 * wrapped them with a hardcoded `isError: false`. Migrating to the envelope
 * lets handlers signal soft errors and (Phase B2) include `structuredContent`
 * for tools that produce naturally JSON-shaped data.
 */
export interface McpTextContent {
  type: 'text';
  text: string;
}

export type McpContentBlock = McpTextContent;

export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

/** Wraps a plain text reply into the MCP envelope. */
export function textResult(
  text: string,
  opts?: { isError?: boolean; structuredContent?: Record<string, unknown> },
): McpToolResult {
  const result: McpToolResult = { content: [{ type: 'text', text }] };
  if (opts?.isError) result.isError = true;
  if (opts?.structuredContent) result.structuredContent = opts.structuredContent;
  return result;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  handler: (args: Record<string, unknown>, workspaceRoot: string) => Promise<McpToolResult>;
}
