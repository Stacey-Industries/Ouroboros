import type { JsonSchemaProperty, McpToolSchema, UpstreamServer } from './types'

const HEADER = `/**
 * Code Mode — auto-generated type definitions for MCP tools.
 * Write TypeScript code using the \`servers\` namespace to call tools.
 */`

/** Sanitize a server name into a valid JS identifier */
function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^(\d)/, '_$1')
}

/** Map a JSON Schema property to a TypeScript type string */
function schemaToType(schema: JsonSchemaProperty): string {
  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  }

  if (schema.anyOf || schema.oneOf) {
    const variants = schema.anyOf ?? schema.oneOf!
    const mapped = variants.map(schemaToType)
    return mapped.length > 1 ? `(${mapped.join(' | ')})` : mapped[0] ?? 'unknown'
  }

  if (schema.allOf || schema.$ref) {
    return 'unknown'
  }

  switch (schema.type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array':
      if (schema.items) {
        const inner = schemaToType(schema.items)
        return inner.includes('|') ? `(${inner})[]` : `${inner}[]`
      }
      return 'unknown[]'
    case 'object':
      return objectToInlineType(schema.properties ?? {}, schema.required ?? [])
    default:
      return 'unknown'
  }
}

/** Build an inline object type from JSON Schema properties */
function objectToInlineType(
  properties: Record<string, JsonSchemaProperty>,
  required: string[]
): string {
  const entries = Object.entries(properties)
  if (entries.length === 0) return 'Record<string, unknown>'

  const lines = entries.map(([key, prop]) => {
    const opt = required.includes(key) ? '' : '?'
    const comment = prop.description ? `/** ${prop.description} */ ` : ''
    return `${comment}${key}${opt}: ${schemaToType(prop)}`
  })
  return `{ ${lines.join('; ')} }`
}

/** Generate a function signature for a single MCP tool */
function toolToDeclaration(tool: McpToolSchema, indent: string): string {
  const lines: string[] = []

  if (tool.description) {
    lines.push(`${indent}/** ${tool.description} */`)
  }

  const props = tool.inputSchema.properties ?? {}
  const required = tool.inputSchema.required ?? []
  const paramEntries = Object.entries(props)

  if (paramEntries.length === 0) {
    lines.push(`${indent}function ${sanitizeIdentifier(tool.name)}(): Promise<unknown>;`)
  } else {
    const paramLines = paramEntries.map(([key, prop]) => {
      const opt = required.includes(key) ? '' : '?'
      const comment = prop.description ? `${indent}      /** ${prop.description} */\n` : ''
      return `${comment}${indent}      ${key}${opt}: ${schemaToType(prop)};`
    })
    lines.push(`${indent}function ${sanitizeIdentifier(tool.name)}(args: {`)
    lines.push(...paramLines)
    lines.push(`${indent}    }): Promise<unknown>;`)
  }

  return lines.join('\n')
}

/** Generate a namespace block for one upstream server */
function serverToNamespace(server: UpstreamServer): string {
  const ns = sanitizeIdentifier(server.name)
  const toolDecls = server.tools.map((t) => toolToDeclaration(t, '    ')).join('\n\n')
  return `  namespace ${ns} {\n${toolDecls}\n  }`
}

/**
 * Convert all upstream MCP server schemas into a single `.d.ts` string
 * containing a `declare namespace servers` block.
 */
export function generateTypeDefinitions(upstreams: Map<string, UpstreamServer>): string {
  if (upstreams.size === 0) {
    return `${HEADER}\ndeclare namespace servers {}\n`
  }

  const namespaces = Array.from(upstreams.values()).map(serverToNamespace)
  return `${HEADER}\ndeclare namespace servers {\n${namespaces.join('\n\n')}\n}\n`
}
