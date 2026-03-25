/**
 * mcpToolHandlers.ts -- MCP tool definitions for the codebase knowledge graph.
 *
 * Exports a `createGraphMcpTools(context)` function that returns 14 McpToolDefinition
 * objects replicating the codebase-memory-mcp API. Each handler returns formatted
 * plain text (not JSON), includes qualified names and file:line locations, and
 * truncates output at ~8000 chars.
 */

import type { GraphDatabase } from './graphDatabase'
import type { QueryEngine } from './queryEngine'
import type { CypherEngine } from './cypherEngine'
import type { IndexingPipeline } from './indexingPipeline'
import type { McpToolDefinition } from '../internalMcp/internalMcpTypes'

// ---- Context type -------------------------------------------------------------

export interface GraphToolContext {
  db: GraphDatabase
  queryEngine: QueryEngine
  cypherEngine: CypherEngine
  pipeline: IndexingPipeline
  projectName: string
  projectRoot: string
}

// ---- Output helpers -----------------------------------------------------------

const MAX_OUTPUT_CHARS = 8000

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return text.slice(0, MAX_OUTPUT_CHARS) + '\n... (output truncated at 8000 chars)'
}

// ---- Factory ------------------------------------------------------------------

export function createGraphMcpTools(context: GraphToolContext): McpToolDefinition[] {
  const { db, queryEngine, cypherEngine, pipeline, projectName, projectRoot } = context

  return [
    // ========================================================================
    // Tool 1: index_repository
    // ========================================================================
    {
      name: 'index_repository',
      description:
        'Index a repository into the codebase knowledge graph. Parses source files with tree-sitter, extracts functions/classes/interfaces/imports/calls, and builds a queryable property graph. Supports incremental reindex (only changed files are re-parsed).',
      inputSchema: {
        type: 'object',
        properties: {
          repo_path: {
            type: 'string',
            description:
              'Absolute path to the repository root. Defaults to the current workspace.',
          },
        },
        required: [],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const repoPath = (args.repo_path as string) ?? projectRoot

          const result = await pipeline.index({
            projectRoot: repoPath,
            incremental: true,
            onProgress: () => {},
          })

          if (!result.success) {
            return `Indexing failed: ${result.errors.join(', ')}`
          }

          return [
            `Indexed "${result.projectName}" successfully.`,
            `Files: ${result.filesIndexed} indexed, ${result.filesSkipped} skipped (unchanged)`,
            `Nodes: ${result.nodesCreated}`,
            `Edges: ${result.edgesCreated}`,
            `Duration: ${result.durationMs}ms`,
            result.incremental ? '(incremental reindex)' : '(full reindex)',
          ].join('\n')
        } catch (err) {
          return `Error indexing repository: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 2: list_projects
    // ========================================================================
    {
      name: 'list_projects',
      description: 'List all indexed projects with node/edge counts and last index time.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        try {
          const projects = db.listProjects()
          if (projects.length === 0) return 'No projects indexed yet.'

          return truncate(
            projects
              .map((p) => {
                const date = new Date(p.indexed_at).toISOString()
                return `${p.name}: ${p.node_count} nodes, ${p.edge_count} edges (indexed ${date})`
              })
              .join('\n'),
          )
        } catch (err) {
          return `Error listing projects: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 3: delete_project
    // ========================================================================
    {
      name: 'delete_project',
      description: 'Remove a project and all its graph data. Irreversible.',
      inputSchema: {
        type: 'object',
        properties: {
          project_name: {
            type: 'string',
            description: 'Name of the project to delete.',
          },
        },
        required: ['project_name'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const name = args.project_name as string
          const project = db.getProject(name)
          if (!project) return `Project "${name}" not found.`

          db.deleteProject(name)
          return `Deleted project "${name}" and all its graph data.`
        } catch (err) {
          return `Error deleting project: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 4: index_status
    // ========================================================================
    {
      name: 'index_status',
      description: 'Get the current indexing status for a project.',
      inputSchema: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: 'Project name. Defaults to current workspace.',
          },
        },
        required: [],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const name = (args.project as string) ?? projectName
          const project = db.getProject(name)
          if (!project)
            return `Project "${name}" is not indexed. Run index_repository first.`

          const nodeCounts = db.getNodeLabelCounts(name)
          const edgeCounts = db.getEdgeTypeCounts(name)

          const lines = [
            `Project: ${name}`,
            `Root: ${project.root_path}`,
            `Indexed: ${new Date(project.indexed_at).toISOString()}`,
            `Total nodes: ${project.node_count}`,
            `Total edges: ${project.edge_count}`,
            '',
            'Node counts by label:',
            ...Object.entries(nodeCounts).map(
              ([label, count]) => `  ${label}: ${count}`,
            ),
            '',
            'Edge counts by type:',
            ...Object.entries(edgeCounts).map(
              ([type, count]) => `  ${type}: ${count}`,
            ),
          ]

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error getting index status: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 5: search_graph
    // ========================================================================
    {
      name: 'search_graph',
      description:
        'Search the codebase knowledge graph for nodes by label, name pattern, file path, relationship degree, and more. Supports pagination. Use min_degree=0 with direction=inbound and exclude_entry_points=true for dead code detection.',
      inputSchema: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description:
              'Node label filter: Project, Package, Folder, File, Module, Function, Method, Class, Interface, Type, Enum, Route',
          },
          name_pattern: {
            type: 'string',
            description:
              'Substring match on node name (case-insensitive by default)',
          },
          project: {
            type: 'string',
            description: 'Project name filter. Defaults to current workspace.',
          },
          file_pattern: {
            type: 'string',
            description: 'File path substring filter',
          },
          relationship: {
            type: 'string',
            description:
              'Edge type filter for degree queries: CALLS, IMPORTS, DEFINES, etc.',
          },
          direction: {
            type: 'string',
            enum: ['inbound', 'outbound', 'both'],
            description: 'Edge direction for degree filtering',
          },
          min_degree: {
            type: 'number',
            description: 'Minimum edge degree',
          },
          max_degree: {
            type: 'number',
            description: 'Maximum edge degree',
          },
          exclude_entry_points: {
            type: 'boolean',
            description: 'Exclude entry point functions from results',
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Case-sensitive name matching (default false)',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 100)',
          },
          offset: {
            type: 'number',
            description: 'Pagination offset (default 0)',
          },
        },
        required: [],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const result = db.searchNodes({
            project: (args.project as string) ?? projectName,
            label: args.label as undefined,
            namePattern: args.name_pattern as string | undefined,
            filePath: args.file_pattern as string | undefined,
            relationship: args.relationship as undefined,
            direction: args.direction as undefined,
            minDegree: args.min_degree as number | undefined,
            maxDegree: args.max_degree as number | undefined,
            excludeEntryPoints: args.exclude_entry_points as boolean | undefined,
            caseSensitive: args.case_sensitive as boolean | undefined,
            limit: (args.limit as number) ?? 100,
            offset: (args.offset as number) ?? 0,
          })

          if (result.nodes.length === 0) return 'No matching nodes found.'

          const lines = [
            `Found ${result.total} nodes (showing ${result.nodes.length}):`,
            '',
          ]

          for (const node of result.nodes) {
            const props = node.props as Record<string, unknown>
            const sig = props.signature ? ` ${props.signature}` : ''
            const loc = node.file_path
              ? `${node.file_path}${node.start_line ? ':' + node.start_line : ''}`
              : ''

            lines.push(`${node.label} ${node.name}${sig}`)
            if (loc) lines.push(`  ${loc}`)
            lines.push(`  qualified: ${node.qualified_name}`)
            lines.push('')
          }

          if (result.has_more) {
            lines.push(
              `... ${result.total - result.nodes.length} more results. Use offset=${((args.offset as number) ?? 0) + result.nodes.length} to see more.`,
            )
          }

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error searching graph: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 6: get_graph_schema
    // ========================================================================
    {
      name: 'get_graph_schema',
      description:
        'Get the graph schema: node label counts, edge type counts, relationship patterns, and sample names. Run this first to orient yourself.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        try {
          const schema = queryEngine.getGraphSchema()

          const lines = [
            'Node labels:',
            ...Object.entries(schema.nodeLabelCounts).map(
              ([l, c]) => `  ${l}: ${c}`,
            ),
            '',
            'Edge types:',
            ...Object.entries(schema.edgeTypeCounts).map(
              ([t, c]) => `  ${t}: ${c}`,
            ),
            '',
            'Relationship patterns:',
            ...schema.relationshipPatterns.map((p) => `  ${p}`),
            '',
            'Sample function names:',
            ...schema.sampleNames.functions.map((n) => `  ${n}`),
            '',
            'Sample class names:',
            ...schema.sampleNames.classes.map((n) => `  ${n}`),
            '',
            'Sample qualified names:',
            ...schema.sampleNames.qualifiedNames.map((n) => `  ${n}`),
          ]

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error getting graph schema: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 7: get_architecture
    // ========================================================================
    {
      name: 'get_architecture',
      description:
        'Get a high-level architectural overview of the codebase. Available aspects: languages, packages, entry_points, routes, hotspots, boundaries, services, layers, file_tree, adr. Use "all" for everything.',
      inputSchema: {
        type: 'object',
        properties: {
          aspects: {
            type: 'array',
            items: { type: 'string' },
            description: 'Which aspects to include. Default: ["all"]',
          },
          project: {
            type: 'string',
            description: 'Project name. Defaults to current workspace.',
          },
        },
        required: [],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const aspects = (args.aspects as string[]) ?? ['all']
          const result = queryEngine.getArchitecture(
            aspects as Parameters<QueryEngine['getArchitecture']>[0],
          )

          const lines = [`Architecture: ${result.projectName}`, '']
          for (const [aspect, content] of Object.entries(result.aspects)) {
            lines.push(`## ${aspect}`, content, '')
          }

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error getting architecture: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 8: search_code
    // ========================================================================
    {
      name: 'search_code',
      description:
        'Search for text patterns in source files. Like grep but scoped to the indexed project. Supports regex and file pattern filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (text or regex)',
          },
          file_pattern: {
            type: 'string',
            description: 'File path filter (glob-like, e.g. "*.ts")',
          },
          regex: {
            type: 'boolean',
            description: 'Treat pattern as regex (default false)',
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Case-sensitive search (default false)',
          },
          max_results: {
            type: 'number',
            description: 'Maximum results (default 100)',
          },
          offset: {
            type: 'number',
            description: 'Pagination offset (default 0)',
          },
        },
        required: ['pattern'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const result = queryEngine.searchCode({
            pattern: args.pattern as string,
            filePattern: args.file_pattern as string | undefined,
            regex: args.regex as boolean | undefined,
            caseSensitive: args.case_sensitive as boolean | undefined,
            maxResults: (args.max_results as number) ?? 100,
            offset: args.offset as number | undefined,
          })

          if (result.results.length === 0) return 'No matches found.'

          const lines = [`Found ${result.total} matches:`]
          for (const r of result.results) {
            lines.push(`${r.filePath}:${r.lineNumber}: ${r.lineContent}`)
          }

          if (result.hasMore) {
            lines.push(
              `... more results available. Use offset=${((args.offset as number) ?? 0) + result.results.length}`,
            )
          }

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error searching code: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 9: get_code_snippet
    // ========================================================================
    {
      name: 'get_code_snippet',
      description:
        'Get the source code for a function, class, or other symbol by its qualified name. Use search_graph to find qualified names first.',
      inputSchema: {
        type: 'object',
        properties: {
          qualified_name: {
            type: 'string',
            description:
              'The full qualified name (e.g., "myproject.src.main.config.getConfigValue")',
          },
        },
        required: ['qualified_name'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const qn = args.qualified_name as string
          const node = db.getNode(qn)
          if (!node) return `Symbol not found: ${qn}`

          const snippet = queryEngine.getCodeSnippet(qn)
          if (!snippet) return `Could not read source for: ${qn}`

          const props = node.props as Record<string, unknown>
          const header = [
            `${node.label} ${node.name}`,
            props.signature ? `Signature: ${props.signature}` : null,
            `File: ${node.file_path}:${node.start_line}-${node.end_line}`,
            `Module: ${node.qualified_name.split('.').slice(0, -1).join('.')}`,
            '',
          ]
            .filter(Boolean)
            .join('\n')

          return truncate(header + snippet)
        } catch (err) {
          return `Error getting code snippet: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 10: trace_call_path
    // ========================================================================
    {
      name: 'trace_call_path',
      description:
        'Trace the call graph from/to a function. Shows who calls it (inbound), what it calls (outbound), or both. Includes function signatures and file locations. Optionally adds risk classification (CRITICAL/HIGH/MEDIUM/LOW).',
      inputSchema: {
        type: 'object',
        properties: {
          function_name: {
            type: 'string',
            description: 'Exact function name to trace from',
          },
          direction: {
            type: 'string',
            enum: ['inbound', 'outbound', 'both'],
            description: 'Direction to trace (default: both)',
          },
          depth: {
            type: 'number',
            description: 'Max traversal depth, 1-5 (default: 3)',
          },
          risk_labels: {
            type: 'boolean',
            description:
              'Include CRITICAL/HIGH/MEDIUM/LOW risk classification (default: false)',
          },
        },
        required: ['function_name'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const result = queryEngine.traceCallPath({
            functionName: args.function_name as string,
            direction:
              (args.direction as 'inbound' | 'outbound' | 'both') ?? 'both',
            depth: Math.min(Math.max((args.depth as number) ?? 3, 1), 5),
            riskLabels: (args.risk_labels as boolean) ?? false,
          })

          if (!result.startNode) {
            return `Function "${args.function_name}" not found in the graph.`
          }

          const lines: string[] = [
            `Trace from: ${result.startNode.label} ${result.startNode.name}`,
          ]
          if (result.startNode.signature) {
            lines.push(`  Signature: ${result.startNode.signature}`)
          }
          if (result.startNode.filePath) {
            lines.push(
              `  File: ${result.startNode.filePath}:${result.startNode.startLine}`,
            )
          }
          lines.push('')
          lines.push(
            `${result.totalNodes} connected nodes found${result.truncated ? ' (truncated at 200)' : ''}:`,
          )
          lines.push('')

          // Group by depth
          const byDepth = new Map<number, typeof result.nodes>()
          for (const node of result.nodes) {
            const group = byDepth.get(node.depth) ?? []
            group.push(node)
            byDepth.set(node.depth, group)
          }

          for (const [depth, nodes] of Array.from(byDepth.entries()).sort(
            (a, b) => a[0] - b[0],
          )) {
            lines.push(`Depth ${depth}:`)
            for (const node of nodes) {
              const risk = node.risk ? ` [${node.risk}]` : ''
              const sig = node.signature ? ` ${node.signature}` : ''
              lines.push(`  ${node.label} ${node.name}${sig}${risk}`)
              if (node.filePath)
                lines.push(`    ${node.filePath}:${node.startLine}`)
            }
            lines.push('')
          }

          if (result.impactSummary) {
            lines.push(result.impactSummary)
          }

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error tracing call path: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 11: detect_changes
    // ========================================================================
    {
      name: 'detect_changes',
      description:
        'Map uncommitted git changes to affected graph symbols and compute blast radius. Shows which functions/classes changed and who calls them (impacted callers with risk classification).',
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['unstaged', 'staged', 'all', 'branch'],
            description: 'Git diff scope (default: all)',
          },
          base_branch: {
            type: 'string',
            description: 'Base branch for "branch" scope (default: main)',
          },
          depth: {
            type: 'number',
            description: 'BFS depth for blast radius, 1-5 (default: 3)',
          },
        },
        required: [],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const result = queryEngine.detectChanges({
            scope:
              (args.scope as 'unstaged' | 'staged' | 'all' | 'branch') ??
              'all',
            baseBranch: args.base_branch as string | undefined,
            depth: Math.min(Math.max((args.depth as number) ?? 3, 1), 5),
          })

          if (result.changedFiles.length === 0) {
            return 'No changes detected.'
          }

          const lines = [
            `Changed files (${result.changedFiles.length}):`,
            ...result.changedFiles.map((f) => `  [${f.status}] ${f.path}`),
            '',
          ]

          if (result.changedSymbols.length > 0) {
            lines.push(`Changed symbols (${result.changedSymbols.length}):`)
            for (const sym of result.changedSymbols) {
              lines.push(`  ${sym.label} ${sym.name} (${sym.filePath})`)
            }
            lines.push('')
          }

          if (result.impactedCallers.length > 0) {
            lines.push(`Impacted callers (${result.impactedCallers.length}):`)
            for (const caller of result.impactedCallers) {
              lines.push(
                `  [${caller.risk}] ${caller.label} ${caller.name} (depth ${caller.depth}) -- ${caller.filePath}`,
              )
            }
            lines.push('')
          }

          lines.push('Risk summary:')
          for (const [level, count] of Object.entries(result.riskSummary)) {
            if (count > 0) lines.push(`  ${level}: ${count}`)
          }

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Error detecting changes: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 12: query_graph
    // ========================================================================
    {
      name: 'query_graph',
      description:
        'Execute a Cypher-like query against the codebase graph. Supports MATCH, WHERE, RETURN, ORDER BY, LIMIT, variable-length paths, COUNT, DISTINCT. Read-only. Results capped at 200 rows.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Cypher query (e.g., "MATCH (n:Function) WHERE n.name CONTAINS \'config\' RETURN n.name, n.file_path LIMIT 10")',
          },
        },
        required: ['query'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const result = cypherEngine.execute(args.query as string)

          if (result.rows.length === 0) return 'No results.'

          const lines = [
            `Columns: ${result.columns.join(', ')}`,
            `Results: ${result.total}`,
            '',
          ]

          for (const row of result.rows) {
            const values = result.columns.map((col) => {
              const val = row[col]
              return typeof val === 'object'
                ? JSON.stringify(val)
                : String(val ?? 'null')
            })
            lines.push(values.join(' | '))
          }

          return truncate(lines.join('\n'))
        } catch (err) {
          return `Query error: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 13: manage_adr
    // ========================================================================
    {
      name: 'manage_adr',
      description:
        'Manage Architecture Decision Records (ADR). Modes: get (read), store (create/overwrite), update (patch specific sections), delete. Sections: PURPOSE, STACK, ARCHITECTURE, PATTERNS, TRADEOFFS, PHILOSOPHY.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['get', 'store', 'update', 'delete'],
            description: 'Operation mode',
          },
          project: {
            type: 'string',
            description: 'Project name (default: current workspace)',
          },
          content: {
            type: 'string',
            description: 'Full ADR content (for "store" mode)',
          },
          sections: {
            type: 'object',
            description:
              'Section updates (for "update" mode). Keys: PURPOSE, STACK, ARCHITECTURE, PATTERNS, TRADEOFFS, PHILOSOPHY',
          },
        },
        required: ['mode'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const proj = (args.project as string) ?? projectName
          const mode = args.mode as string

          switch (mode) {
            case 'get': {
              const adr = db.getAdr(proj)
              if (!adr) return `No ADR found for project "${proj}".`
              return truncate(adr.summary)
            }

            case 'store': {
              const content = args.content as string
              if (!content) return 'Error: content is required for store mode.'
              if (content.length > 8000)
                return 'Error: ADR content exceeds 8000 character limit.'

              db.upsertAdr({
                project: proj,
                summary: content,
                source_hash: '',
                created_at: Date.now(),
                updated_at: Date.now(),
              })
              return `ADR stored for project "${proj}".`
            }

            case 'update': {
              const sections = args.sections as
                | Record<string, string>
                | undefined
              if (!sections)
                return 'Error: sections object is required for update mode.'

              const validSections = [
                'PURPOSE',
                'STACK',
                'ARCHITECTURE',
                'PATTERNS',
                'TRADEOFFS',
                'PHILOSOPHY',
              ]
              for (const key of Object.keys(sections)) {
                if (!validSections.includes(key)) {
                  return `Error: invalid section "${key}". Valid: ${validSections.join(', ')}`
                }
              }

              const existing = db.getAdr(proj)
              let currentSections: Record<string, string> = {}

              if (existing) {
                try {
                  currentSections = JSON.parse(existing.summary)
                } catch {
                  currentSections = {}
                }
              }

              Object.assign(currentSections, sections)
              const merged = JSON.stringify(currentSections, null, 2)

              if (merged.length > 8000)
                return 'Error: merged ADR exceeds 8000 character limit.'

              db.upsertAdr({
                project: proj,
                summary: merged,
                source_hash: '',
                created_at: existing?.created_at ?? Date.now(),
                updated_at: Date.now(),
              })
              return `ADR updated for project "${proj}". Sections updated: ${Object.keys(sections).join(', ')}`
            }

            case 'delete': {
              db.deleteAdr(proj)
              return `ADR deleted for project "${proj}".`
            }

            default:
              return `Unknown mode: ${mode}`
          }
        } catch (err) {
          return `Error managing ADR: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    },

    // ========================================================================
    // Tool 14: ingest_traces
    // ========================================================================
    {
      name: 'ingest_traces',
      description:
        'Ingest OpenTelemetry traces to validate/strengthen HTTP_CALLS edges with runtime data. (Stub -- accepts trace data but full processing is a future enhancement.)',
      inputSchema: {
        type: 'object',
        properties: {
          traces: {
            type: 'string',
            description: 'JSON trace data (OpenTelemetry format)',
          },
        },
        required: ['traces'],
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          const traceData = args.traces as string
          const parsed = JSON.parse(traceData)
          const spanCount = Array.isArray(parsed) ? parsed.length : 1
          return `Received ${spanCount} trace span(s). Trace ingestion is not yet fully implemented -- edges will be updated in a future release.`
        } catch {
          return 'Error: invalid JSON trace data.'
        }
      },
    },
  ]
}
