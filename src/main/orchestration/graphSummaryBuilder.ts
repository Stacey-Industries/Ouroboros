/**
 * graphSummaryBuilder.ts — Queries the built-in codebase graph engine for
 * structural data (hotspots, blast radius) and formats a lightweight summary
 * for injection into context packets.
 *
 * Uses the native GraphController (src/main/codebaseGraph) — no external
 * MCP server needed.
 */

import { getGraphController } from '../codebaseGraph/graphController';
import log from '../logger';

const MAX_HOTSPOTS = 20;
const MAX_BLAST_RADIUS = 15;
const MAX_SUMMARY_CHARS = 2400; // ~600 tokens

export interface GraphHotspot {
  name: string;
  file: string;
  callerCount: number;
  calleeCount: number;
}

export interface BlastRadiusItem {
  symbol: string;
  file: string;
  risk: string; // CRITICAL | HIGH | MEDIUM | LOW
  hop: number;
}

export interface GraphSummary {
  hotspots: GraphHotspot[];
  blastRadius: BlastRadiusItem[];
  builtAt: number;
}

const EMPTY_SUMMARY: GraphSummary = { hotspots: [], blastRadius: [], builtAt: 0 };

/** Format the graph summary as a concise markdown section for context injection. */
export function formatGraphSummary(summary: GraphSummary): string {
  if (summary.hotspots.length === 0 && summary.blastRadius.length === 0) return '';

  const parts: string[] = [];

  if (summary.hotspots.length > 0) {
    parts.push('## Structural Hotspots (most-connected functions — changes here have wide impact)');
    for (const h of summary.hotspots) {
      parts.push(
        `- **${h.name}** (${h.file}) — ${h.callerCount} callers, ${h.calleeCount} callees`,
      );
    }
  }

  if (summary.blastRadius.length > 0) {
    parts.push('');
    parts.push('## Uncommitted Change Blast Radius');
    for (const b of summary.blastRadius) {
      parts.push(`- [${b.risk}] **${b.symbol}** (${b.file})`);
    }
  }

  const result = parts.join('\n');
  return result.length > MAX_SUMMARY_CHARS
    ? result.slice(0, MAX_SUMMARY_CHARS) + '\n...(truncated)'
    : result;
}

/** Build a graph summary from the native GraphController. */
export async function buildGraphSummary(): Promise<GraphSummary> {
  const ctrl = getGraphController();
  if (!ctrl) return EMPTY_SUMMARY;

  try {
    const [architecture, changes] = await Promise.all([
      Promise.resolve(ctrl.getArchitecture(['hotspots'])),
      ctrl.detectChanges().catch(() => null),
    ]);

    const hotspots = extractHotspots(architecture);
    const blastRadius = changes ? extractBlastRadius(changes) : [];

    return { hotspots, blastRadius, builtAt: Date.now() };
  } catch (err) {
    log.warn('Failed to build graph summary:', err);
    return EMPTY_SUMMARY;
  }
}

function resolveHotspotName(e: Record<string, unknown>): string {
  return String(e.name ?? e.id ?? e.filePath ?? '');
}

function resolveHotspotFile(e: Record<string, unknown>): string {
  return String(e.file ?? e.path ?? e.filePath ?? '');
}

function resolveCallerCount(e: Record<string, unknown>): number {
  return Number(e.callerCount ?? e.fanIn ?? e.fan_in ?? e.inDegree ?? 0);
}

function resolveCalleeCount(e: Record<string, unknown>): number {
  return Number(e.calleeCount ?? e.fanOut ?? e.fan_out ?? e.outDegree ?? 0);
}

function parseHotspotEntry(entry: unknown): GraphHotspot | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  return {
    name: resolveHotspotName(e),
    file: resolveHotspotFile(e),
    callerCount: resolveCallerCount(e),
    calleeCount: resolveCalleeCount(e),
  };
}

function extractHotspots(arch: Record<string, unknown>): GraphHotspot[] {
  const raw = (arch as { hotspots?: unknown[] }).hotspots;
  if (!Array.isArray(raw)) return [];

  const hotspots: GraphHotspot[] = [];
  for (const entry of raw.slice(0, MAX_HOTSPOTS)) {
    const parsed = parseHotspotEntry(entry);
    if (parsed) hotspots.push(parsed);
  }
  return hotspots;
}

function resolveAffectedList(changes: Record<string, unknown>): unknown[] | null {
  const affected =
    (changes as { affectedSymbols?: unknown[] }).affectedSymbols ??
    (changes as { affected?: unknown[] }).affected ??
    (changes as { impacted?: unknown[] }).impacted;
  return Array.isArray(affected) ? affected : null;
}

function resolveBlastSymbol(e: Record<string, unknown>): string {
  return String(e.symbol ?? e.name ?? e.id ?? '');
}

function resolveBlastRisk(e: Record<string, unknown>): string {
  return String(e.risk ?? e.level ?? 'MEDIUM');
}

function parseBlastRadiusEntry(entry: unknown): BlastRadiusItem | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  return {
    symbol: resolveBlastSymbol(e),
    file: resolveHotspotFile(e),
    risk: resolveBlastRisk(e),
    hop: Number(e.hop ?? e.distance ?? 1),
  };
}

function extractBlastRadius(changes: Record<string, unknown>): BlastRadiusItem[] {
  const affected = resolveAffectedList(changes);
  if (!affected) return [];

  const items: BlastRadiusItem[] = [];
  for (const entry of affected.slice(0, MAX_BLAST_RADIUS)) {
    const parsed = parseBlastRadiusEntry(entry);
    if (parsed) items.push(parsed);
  }
  return items;
}
