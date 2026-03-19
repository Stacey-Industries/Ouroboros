/**
 * graphSummaryBuilder.ts — Queries the built-in codebase graph engine for
 * structural data (hotspots, blast radius) and formats a lightweight summary
 * for injection into context packets.
 *
 * Uses the native GraphController (src/main/codebaseGraph) — no external
 * MCP server needed.
 */

import { getGraphController } from '../codebaseGraph/graphController'

const MAX_HOTSPOTS = 20
const MAX_BLAST_RADIUS = 15
const MAX_SUMMARY_CHARS = 2400 // ~600 tokens

export interface GraphHotspot {
  name: string
  file: string
  callerCount: number
  calleeCount: number
}

export interface BlastRadiusItem {
  symbol: string
  file: string
  risk: string // CRITICAL | HIGH | MEDIUM | LOW
  hop: number
}

export interface GraphSummary {
  hotspots: GraphHotspot[]
  blastRadius: BlastRadiusItem[]
  builtAt: number
}

const EMPTY_SUMMARY: GraphSummary = { hotspots: [], blastRadius: [], builtAt: 0 }

/** Format the graph summary as a concise markdown section for context injection. */
export function formatGraphSummary(summary: GraphSummary): string {
  if (summary.hotspots.length === 0 && summary.blastRadius.length === 0) return ''

  const parts: string[] = []

  if (summary.hotspots.length > 0) {
    parts.push('## Structural Hotspots (most-connected functions — changes here have wide impact)')
    for (const h of summary.hotspots) {
      parts.push(`- **${h.name}** (${h.file}) — ${h.callerCount} callers, ${h.calleeCount} callees`)
    }
  }

  if (summary.blastRadius.length > 0) {
    parts.push('')
    parts.push('## Uncommitted Change Blast Radius')
    for (const b of summary.blastRadius) {
      parts.push(`- [${b.risk}] **${b.symbol}** (${b.file})`)
    }
  }

  const result = parts.join('\n')
  return result.length > MAX_SUMMARY_CHARS ? result.slice(0, MAX_SUMMARY_CHARS) + '\n...(truncated)' : result
}

/** Build a graph summary from the native GraphController. */
export async function buildGraphSummary(_projectRoot?: string): Promise<GraphSummary> {
  const ctrl = getGraphController()
  if (!ctrl) return EMPTY_SUMMARY

  try {
    const [architecture, changes] = await Promise.all([
      Promise.resolve(ctrl.getArchitecture(['hotspots'])),
      ctrl.detectChanges().catch(() => null),
    ])

    const hotspots = extractHotspots(architecture)
    const blastRadius = changes ? extractBlastRadius(changes) : []

    return { hotspots, blastRadius, builtAt: Date.now() }
  } catch (err) {
    console.warn('[graphSummary] Failed to build graph summary:', err)
    return EMPTY_SUMMARY
  }
}

function extractHotspots(arch: Record<string, unknown>): GraphHotspot[] {
  // The architecture view's hotspots field contains the most-connected symbols
  const hotspots: GraphHotspot[] = []
  const raw = (arch as { hotspots?: unknown[] }).hotspots
  if (!Array.isArray(raw)) return hotspots

  for (const entry of raw.slice(0, MAX_HOTSPOTS)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    hotspots.push({
      name: String(e.name ?? e.id ?? e.filePath ?? ''),
      file: String(e.file ?? e.path ?? e.filePath ?? ''),
      callerCount: Number(e.callerCount ?? e.fanIn ?? e.fan_in ?? e.inDegree ?? 0),
      calleeCount: Number(e.calleeCount ?? e.fanOut ?? e.fan_out ?? e.outDegree ?? 0),
    })
  }
  return hotspots
}

function extractBlastRadius(changes: Record<string, unknown>): BlastRadiusItem[] {
  const items: BlastRadiusItem[] = []
  const affected = (changes as { affectedSymbols?: unknown[] }).affectedSymbols
    ?? (changes as { affected?: unknown[] }).affected
    ?? (changes as { impacted?: unknown[] }).impacted
  if (!Array.isArray(affected)) return items

  for (const entry of affected.slice(0, MAX_BLAST_RADIUS)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    items.push({
      symbol: String(e.symbol ?? e.name ?? e.id ?? ''),
      file: String(e.file ?? e.path ?? e.filePath ?? ''),
      risk: String(e.risk ?? e.level ?? 'MEDIUM'),
      hop: Number(e.hop ?? e.distance ?? 1),
    })
  }
  return items
}
