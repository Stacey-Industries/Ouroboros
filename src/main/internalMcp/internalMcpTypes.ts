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

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  handler: (args: Record<string, unknown>, workspaceRoot: string) => Promise<string>;
}
