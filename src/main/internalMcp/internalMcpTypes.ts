// Part of the unwired internalMcp module — see index.ts for deprecation notice.

export interface InternalMcpServerOptions {
  workspaceRoot: string
  port?: number  // 0 = random (default)
}

export interface InternalMcpServerHandle {
  port: number
  stop: () => Promise<void>
}

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema
  handler: (args: Record<string, unknown>, workspaceRoot: string) => Promise<string>
}
