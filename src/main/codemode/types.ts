/** JSON Schema property (subset we support) */
export interface JsonSchemaProperty {
  type?: string
  description?: string
  enum?: string[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  anyOf?: JsonSchemaProperty[]
  oneOf?: JsonSchemaProperty[]
  allOf?: JsonSchemaProperty[]
  $ref?: string
}

/** MCP tool schema as returned by tools/list */
export interface McpToolSchema {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, JsonSchemaProperty>
    required?: string[]
  }
}

/** Runtime state for a connected upstream MCP server */
export interface UpstreamServer {
  name: string
  tools: McpToolSchema[]
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
  dispose: () => void
}

/** Code Mode proxy state */
export interface CodeModeState {
  enabled: boolean
  upstreams: Map<string, UpstreamServer>
  generatedTypes: string
}

/** Result of enabling/disabling Code Mode */
export interface CodeModeStatusResult {
  enabled: boolean
  proxiedServers: string[]
  generatedTypes: string
}
