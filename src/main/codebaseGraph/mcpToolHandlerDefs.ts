/**
 * mcpToolHandlerDefs.ts — Tool handler implementations extracted from
 * mcpToolHandlers.ts to keep the factory function under the line limit.
 */

import { truncate } from './mcpToolHandlerHelpers'
import type { GraphToolContext } from './mcpToolHandlers'

// ─── index_repository handler ─────────────────────────────────────────────────

export async function handleIndexRepository(args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  try {
    const repoPath = (args.repo_path as string) ?? ctx.projectRoot
    const result = await ctx.pipeline.index({ projectRoot: repoPath, incremental: true, onProgress: () => {} })
    if (!result.success) return `Indexing failed: ${result.errors.join(', ')}`
    return [
      `Indexed "${result.projectName}" successfully.`,
      `Files: ${result.filesIndexed} indexed, ${result.filesSkipped} skipped (unchanged)`,
      `Nodes: ${result.nodesCreated}`, `Edges: ${result.edgesCreated}`,
      `Duration: ${result.durationMs}ms`,
      result.incremental ? '(incremental reindex)' : '(full reindex)',
    ].join('\n')
  } catch (err) { return `Error indexing repository: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── list_projects handler ────────────────────────────────────────────────────

export async function handleListProjects(ctx: GraphToolContext): Promise<string> {
  try {
    const projects = ctx.db.listProjects()
    if (projects.length === 0) return 'No projects indexed yet.'
    return truncate(projects.map((p) =>
      `${p.name}: ${p.node_count} nodes, ${p.edge_count} edges (indexed ${new Date(p.indexed_at).toISOString()})`,
    ).join('\n'))
  } catch (err) { return `Error listing projects: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── delete_project handler ───────────────────────────────────────────────────

export async function handleDeleteProject(args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  try {
    const name = args.project_name as string
    if (!ctx.db.getProject(name)) return `Project "${name}" not found.`
    ctx.db.deleteProject(name)
    return `Deleted project "${name}" and all its graph data.`
  } catch (err) { return `Error deleting project: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── index_status handler ─────────────────────────────────────────────────────

export async function handleIndexStatus(args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  try {
    const name = (args.project as string) ?? ctx.projectName
    const project = ctx.db.getProject(name)
    if (!project) return `Project "${name}" is not indexed. Run index_repository first.`
    const nodeCounts = ctx.db.getNodeLabelCounts(name)
    const edgeCounts = ctx.db.getEdgeTypeCounts(name)
    const lines = [
      `Project: ${name}`, `Root: ${project.root_path}`,
      `Indexed: ${new Date(project.indexed_at).toISOString()}`,
      `Total nodes: ${project.node_count}`, `Total edges: ${project.edge_count}`, '',
      'Node counts by label:', ...Object.entries(nodeCounts).map(([label, count]) => `  ${label}: ${count}`), '',
      'Edge counts by type:', ...Object.entries(edgeCounts).map(([type, count]) => `  ${type}: ${count}`),
    ]
    return truncate(lines.join('\n'))
  } catch (err) { return `Error getting index status: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── get_graph_schema handler ─────────────────────────────────────────────────

export async function handleGetGraphSchema(ctx: GraphToolContext): Promise<string> {
  try {
    const schema = ctx.queryEngine.getGraphSchema()
    const lines = [
      'Node labels:', ...Object.entries(schema.nodeLabelCounts).map(([l, c]) => `  ${l}: ${c}`), '',
      'Edge types:', ...Object.entries(schema.edgeTypeCounts).map(([t, c]) => `  ${t}: ${c}`), '',
      'Relationship patterns:', ...schema.relationshipPatterns.map((p) => `  ${p}`), '',
      'Sample function names:', ...schema.sampleNames.functions.map((n) => `  ${n}`), '',
      'Sample class names:', ...schema.sampleNames.classes.map((n) => `  ${n}`), '',
      'Sample qualified names:', ...schema.sampleNames.qualifiedNames.map((n) => `  ${n}`),
    ]
    return truncate(lines.join('\n'))
  } catch (err) { return `Error getting graph schema: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── get_architecture handler ─────────────────────────────────────────────────

export async function handleGetArchitecture(args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  try {
    const aspects = (args.aspects as string[]) ?? ['all']
    const result = ctx.queryEngine.getArchitecture(aspects as Parameters<typeof ctx.queryEngine.getArchitecture>[0])
    const lines = [`Architecture: ${result.projectName}`, '']
    for (const [aspect, content] of Object.entries(result.aspects)) {
      lines.push(`## ${aspect}`, content, '')
    }
    return truncate(lines.join('\n'))
  } catch (err) { return `Error getting architecture: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── search_code handler ──────────────────────────────────────────────────────

export async function handleSearchCode(args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  try {
    const result = ctx.queryEngine.searchCode({
      pattern: args.pattern as string, filePattern: args.file_pattern as string | undefined,
      regex: args.regex as boolean | undefined, caseSensitive: args.case_sensitive as boolean | undefined,
      maxResults: (args.max_results as number) ?? 100, offset: args.offset as number | undefined,
    })
    if (result.results.length === 0) return 'No matches found.'
    const lines = [`Found ${result.total} matches:`, ...result.results.map((r) => `${r.filePath}:${r.lineNumber}: ${r.lineContent}`)]
    if (result.hasMore) lines.push(`... more results available. Use offset=${((args.offset as number) ?? 0) + result.results.length}`)
    return truncate(lines.join('\n'))
  } catch (err) { return `Error searching code: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── get_code_snippet handler ─────────────────────────────────────────────────

export async function handleGetCodeSnippet(args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  try {
    const qn = args.qualified_name as string
    const node = ctx.db.getNode(qn)
    if (!node) return `Symbol not found: ${qn}`
    const snippet = ctx.queryEngine.getCodeSnippet(qn)
    if (!snippet) return `Could not read source for: ${qn}`
    const props = node.props as Record<string, unknown>
    const header = [
      `${node.label} ${node.name}`, props.signature ? `Signature: ${props.signature}` : null,
      `File: ${node.file_path}:${node.start_line}-${node.end_line}`,
      `Module: ${node.qualified_name.split('.').slice(0, -1).join('.')}`, '',
    ].filter(Boolean).join('\n')
    return truncate(header + snippet)
  } catch (err) { return `Error getting code snippet: ${err instanceof Error ? err.message : String(err)}` }
}

// ─── ingest_traces handler ────────────────────────────────────────────────────

export async function handleIngestTraces(args: Record<string, unknown>): Promise<string> {
  try {
    const parsed = JSON.parse(args.traces as string)
    const spanCount = Array.isArray(parsed) ? parsed.length : 1
    return `Received ${spanCount} trace span(s). Trace ingestion is not yet fully implemented -- edges will be updated in a future release.`
  } catch { return 'Error: invalid JSON trace data.' }
}
