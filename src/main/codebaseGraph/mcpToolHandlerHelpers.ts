/**
 * mcpToolHandlerHelpers.ts — Handler implementations extracted from mcpToolHandlers.ts
 * to keep the factory function and each handler under the max-lines-per-function limit.
 */

import type { GraphToolContext } from './mcpToolHandlers'
import type { QueryEngine } from './queryEngine'

// ─── Shared output helper ─────────────────────────────────────────────────────

const MAX_OUTPUT_CHARS = 8000

export function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return text.slice(0, MAX_OUTPUT_CHARS) + '\n... (output truncated at 8000 chars)'
}

// ─── Tool 5: search_graph handler ────────────────────────────────────────────

function formatSearchNode(node: { label: string; name: string; file_path?: string | null; start_line?: number | null; qualified_name: string; props: unknown }): string[] {
  const props = node.props as Record<string, unknown>
  const sig = props.signature ? ` ${props.signature}` : ''
  const loc = node.file_path
    ? `${node.file_path}${node.start_line ? ':' + node.start_line : ''}`
    : ''
  const lines = [`${node.label} ${node.name}${sig}`]
  if (loc) lines.push(`  ${loc}`)
  lines.push(`  qualified: ${node.qualified_name}`, '')
  return lines
}

export async function handleSearchGraph(
  args: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const { db, projectName } = ctx
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

  const lines = [`Found ${result.total} nodes (showing ${result.nodes.length}):`, '']
  for (const node of result.nodes) lines.push(...formatSearchNode(node))

  if (result.has_more) {
    const nextOffset = ((args.offset as number) ?? 0) + result.nodes.length
    lines.push(`... ${result.total - result.nodes.length} more results. Use offset=${nextOffset} to see more.`)
  }

  return truncate(lines.join('\n'))
}

// ─── Tool 10: trace_call_path handler ────────────────────────────────────────

type TraceNode = { depth: number; label: string; name: string; signature?: string | null; risk?: string; filePath?: string | null; startLine?: number | null }

function formatTraceDepthGroup(depth: number, nodes: TraceNode[]): string[] {
  const lines = [`Depth ${depth}:`]
  for (const node of nodes) {
    const risk = node.risk ? ` [${node.risk}]` : ''
    const sig = node.signature ? ` ${node.signature}` : ''
    lines.push(`  ${node.label} ${node.name}${sig}${risk}`)
    if (node.filePath) lines.push(`    ${node.filePath}:${node.startLine}`)
  }
  lines.push('')
  return lines
}

function groupNodesByDepth(nodes: TraceNode[]): Map<number, TraceNode[]> {
  const byDepth = new Map<number, TraceNode[]>()
  for (const node of nodes) {
    const group = byDepth.get(node.depth) ?? []
    group.push(node)
    byDepth.set(node.depth, group)
  }
  return byDepth
}

export async function handleTraceCallPath(
  args: Record<string, unknown>,
  queryEngine: QueryEngine,
): Promise<string> {
  const result = queryEngine.traceCallPath({
    functionName: args.function_name as string,
    direction: (args.direction as 'inbound' | 'outbound' | 'both') ?? 'both',
    depth: Math.min(Math.max((args.depth as number) ?? 3, 1), 5),
    riskLabels: (args.risk_labels as boolean) ?? false,
  })

  if (!result.startNode) return `Function "${args.function_name}" not found in the graph.`

  const lines: string[] = [`Trace from: ${result.startNode.label} ${result.startNode.name}`]
  if (result.startNode.signature) lines.push(`  Signature: ${result.startNode.signature}`)
  if (result.startNode.filePath) lines.push(`  File: ${result.startNode.filePath}:${result.startNode.startLine}`)
  lines.push('', `${result.totalNodes} connected nodes found${result.truncated ? ' (truncated at 200)' : ''}:`, '')

  const byDepth = groupNodesByDepth(result.nodes)
  for (const [depth, nodes] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
    lines.push(...formatTraceDepthGroup(depth, nodes))
  }

  if (result.impactSummary) lines.push(result.impactSummary)
  return truncate(lines.join('\n'))
}

// ─── Tool 11: detect_changes handler ─────────────────────────────────────────

export async function handleDetectChanges(
  args: Record<string, unknown>,
  queryEngine: QueryEngine,
): Promise<string> {
  const result = queryEngine.detectChanges({
    scope: (args.scope as 'unstaged' | 'staged' | 'all' | 'branch') ?? 'all',
    baseBranch: args.base_branch as string | undefined,
    depth: Math.min(Math.max((args.depth as number) ?? 3, 1), 5),
  })

  if (result.changedFiles.length === 0) return 'No changes detected.'

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
}

// ─── Tool 13: manage_adr handler ─────────────────────────────────────────────

async function handleAdrGet(proj: string, ctx: GraphToolContext): Promise<string> {
  const adr = ctx.db.getAdr(proj)
  if (!adr) return `No ADR found for project "${proj}".`
  return truncate(adr.summary)
}

async function handleAdrStore(proj: string, args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  const content = args.content as string
  if (!content) return 'Error: content is required for store mode.'
  if (content.length > 8000) return 'Error: ADR content exceeds 8000 character limit.'

  ctx.db.upsertAdr({
    project: proj,
    summary: content,
    source_hash: '',
    created_at: Date.now(),
    updated_at: Date.now(),
  })
  return `ADR stored for project "${proj}".`
}

async function handleAdrUpdate(proj: string, args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  const sections = args.sections as Record<string, string> | undefined
  if (!sections) return 'Error: sections object is required for update mode.'

  const validSections = ['PURPOSE', 'STACK', 'ARCHITECTURE', 'PATTERNS', 'TRADEOFFS', 'PHILOSOPHY']
  for (const key of Object.keys(sections)) {
    if (!validSections.includes(key)) {
      return `Error: invalid section "${key}". Valid: ${validSections.join(', ')}`
    }
  }

  const existing = ctx.db.getAdr(proj)
  let currentSections: Record<string, string> = {}
  if (existing) {
    try { currentSections = JSON.parse(existing.summary) } catch { currentSections = {} }
  }

  Object.assign(currentSections, sections)
  const merged = JSON.stringify(currentSections, null, 2)
  if (merged.length > 8000) return 'Error: merged ADR exceeds 8000 character limit.'

  ctx.db.upsertAdr({
    project: proj,
    summary: merged,
    source_hash: '',
    created_at: existing?.created_at ?? Date.now(),
    updated_at: Date.now(),
  })
  return `ADR updated for project "${proj}". Sections updated: ${Object.keys(sections).join(', ')}`
}

export async function handleManageAdr(
  args: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const proj = (args.project as string) ?? ctx.projectName
  const mode = args.mode as string

  switch (mode) {
    case 'get': return handleAdrGet(proj, ctx)
    case 'store': return handleAdrStore(proj, args, ctx)
    case 'update': return handleAdrUpdate(proj, args, ctx)
    case 'delete': {
      ctx.db.deleteAdr(proj)
      return `ADR deleted for project "${proj}".`
    }
    default: return `Unknown mode: ${mode}`
  }
}

// ─── Tool 12: query_graph handler ────────────────────────────────────────────

export function formatQueryResult(
  result: { columns: string[]; rows: Array<Record<string, unknown>>; total: number },
): string {
  if (result.rows.length === 0) return 'No results.'

  const lines = [
    `Columns: ${result.columns.join(', ')}`,
    `Results: ${result.total}`,
    '',
  ]

  for (const row of result.rows) {
    const values = result.columns.map((col) => {
      // eslint-disable-next-line security/detect-object-injection -- col comes from result.columns
      const val = row[col]
      return typeof val === 'object' ? JSON.stringify(val) : String(val ?? 'null')
    })
    lines.push(values.join(' | '))
  }

  return truncate(lines.join('\n'))
}
