import type { JsonSchemaProperty, McpToolSchema, UpstreamServer } from './types'

const HEADER = `/**
 * Code Mode — auto-generated type definitions for MCP tools.
 * Write TypeScript code using the \`servers\` namespace to call tools.
 */`

/** Sanitize a server name into a valid JS identifier */
function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^(\d)/, '_$1')
}

const PRIMITIVE_SCHEMA_TYPES: Record<string, string> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  null: 'null',
}

function schemaVariantsToType(schema: JsonSchemaProperty): string | null {
  const variants = schema.anyOf ?? schema.oneOf
  if (!variants) {
    return null
  }
  const mapped = variants.map(schemaToType)
  return mapped.length > 1 ? `(${mapped.join(' | ')})` : mapped[0] ?? 'unknown'
}

function enumSchemaToType(schema: JsonSchemaProperty): string | null {
  return schema.enum ? schema.enum.map((v) => JSON.stringify(v)).join(' | ') : null
}

function unsupportedSchemaToType(schema: JsonSchemaProperty): string | null {
  return schema.allOf || schema.$ref ? 'unknown' : null
}

function arraySchemaToType(schema: JsonSchemaProperty): string {
  if (!schema.items) {
    return 'unknown[]'
  }
  const inner = schemaToType(schema.items)
  return inner.includes('|') ? `(${inner})[]` : `${inner}[]`
}

function schemaTypeToType(schema: JsonSchemaProperty): string {
  if (schema.type === 'array') {
    return arraySchemaToType(schema)
  }

  if (schema.type === 'object') {
    return objectToInlineType(schema.properties ?? {}, schema.required ?? [])
  }

  return PRIMITIVE_SCHEMA_TYPES[schema.type ?? ''] ?? 'unknown'
}

/** Map a JSON Schema property to a TypeScript type string */
function schemaToType(schema: JsonSchemaProperty): string {
  return (
    enumSchemaToType(schema)
    ?? schemaVariantsToType(schema)
    ?? unsupportedSchemaToType(schema)
    ?? schemaTypeToType(schema)
  )
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
