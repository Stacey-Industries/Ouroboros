/* eslint-disable no-console */
/**
 * measure-mcp-token-cost.ts — Wave 51 Phase D
 *
 * Reads the per-spawn MCP cost telemetry stream at
 * `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` (emitted by
 * `src/main/orchestration/providers/mcpSpawnCostTelemetry.ts`) and rolls it
 * up by routing decision.
 *
 * Token estimate is `bytes / 4` — matches the approximation used by the
 * emitter. NOT a true tokenizer count; sufficient for relative comparisons
 * across routing decisions.
 *
 * Outputs to stdout:
 *   - total spawns + date range
 *   - per-decision counts
 *   - per-week markdown table: median tokens by routing decision + delta
 *   - 5 largest direct-inject spawns (so the user can see the worst offenders)
 *
 * Run any time post-soak:
 *   npx tsx scripts/measure-mcp-token-cost.ts
 *
 * Tolerant of malformed lines (skipped with a warning), missing files, and
 * an entirely empty corpus ("no data yet").
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

// ─── Types ────────────────────────────────────────────────────────────────────

type RoutingDecision = 'direct-inject' | 'route-through-codemode' | 'omit';
const DECISIONS: RoutingDecision[] = ['direct-inject', 'route-through-codemode', 'omit'];

interface CostRecord {
  ts: number;
  spawnId: string;
  routingDecision: RoutingDecision;
  internalMcpScope: 'always' | 'task-gated' | 'never';
  transport: 'sse' | 'stdio';
  codemodeEnabled: boolean;
  mcpConfigBytes: number;
  serverCount: number;
  tokenEstimate: number;
  serversIncluded: string[];
}

interface Aggregate {
  count: number;
  median: number;
  p25: number;
  p75: number;
}

interface WeekRow {
  weekStart: string;
  byDecision: Record<RoutingDecision, Aggregate>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TELEMETRY_FILE = path.join(os.homedir(), '.ouroboros', 'telemetry', 'mcp-spawn-cost.jsonl');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCostRecord(obj: unknown): obj is CostRecord {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.ts === 'number' &&
    typeof r.spawnId === 'string' &&
    typeof r.routingDecision === 'string' &&
    DECISIONS.includes(r.routingDecision as RoutingDecision) &&
    typeof r.tokenEstimate === 'number'
  );
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted.at(idx) ?? 0;
}

function aggregate(values: number[]): Aggregate {
  if (values.length === 0) return { count: 0, median: 0, p25: 0, p75: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

function weekKey(ts: number): string {
  const d = new Date(ts);
  // Monday-anchored ISO-ish week start.
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d.getTime() - diff * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

// ─── Stream parse ─────────────────────────────────────────────────────────────

interface ParseOutcome {
  records: CostRecord[];
  skipped: number;
}

async function readRecords(filePath: string): Promise<ParseOutcome> {
  if (!fs.existsSync(filePath)) return { records: [], skipped: 0 };
  const records: CostRecord[] = [];
  let skipped = 0;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (isCostRecord(parsed)) records.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { records, skipped };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function groupByWeek(records: CostRecord[]): Map<string, CostRecord[]> {
  const out = new Map<string, CostRecord[]>();
  for (const r of records) {
    const key = weekKey(r.ts);
    const list = out.get(key);
    if (list) list.push(r);
    else out.set(key, [r]);
  }
  return out;
}

function buildWeekRows(records: CostRecord[]): WeekRow[] {
  const grouped = groupByWeek(records);
  const rows: WeekRow[] = [];
  const keys = [...grouped.keys()].sort();
  for (const key of keys) {
    const weekRecords = grouped.get(key) ?? [];
    const byDecision = {} as Record<RoutingDecision, Aggregate>;
    for (const decision of DECISIONS) {
      const tokens = weekRecords
        .filter((r) => r.routingDecision === decision)
        .map((r) => r.tokenEstimate);
      byDecision[decision] = aggregate(tokens);
    }
    rows.push({ weekStart: key, byDecision });
  }
  return rows;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printHeader(records: CostRecord[], skipped: number): void {
  console.log('# MCP Spawn Cost — Routing Rollup');
  console.log('');
  console.log(`Source: ${TELEMETRY_FILE}`);
  console.log(`Records: ${records.length}  (skipped malformed lines: ${skipped})`);
  if (records.length === 0) {
    console.log('');
    console.log('No data yet — emit some spawns and re-run.');
    return;
  }
  const tsValues = records.map((r) => r.ts).sort((a, b) => a - b);
  console.log(
    `Range: ${new Date(tsValues[0]).toISOString()} → ${new Date(tsValues[tsValues.length - 1]).toISOString()}`,
  );
  console.log('');
  console.log('## Routing decision breakdown');
  for (const decision of DECISIONS) {
    const count = records.filter((r) => r.routingDecision === decision).length;
    console.log(`- ${decision}: ${count}`);
  }
}

function fmtAgg(a: Aggregate): string {
  if (a.count === 0) return '–';
  return `${a.median} (n=${a.count}, p25=${a.p25}, p75=${a.p75})`;
}

function printWeekTable(rows: WeekRow[]): void {
  if (rows.length === 0) return;
  console.log('');
  console.log('## Per-week median token estimate by routing decision');
  console.log('');
  console.log(
    '| Week start | direct-inject | route-through-codemode | omit | delta (direct − routed) |',
  );
  console.log('|---|---|---|---|---|');
  for (const row of rows) {
    const di = row.byDecision['direct-inject'];
    const rt = row.byDecision['route-through-codemode'];
    const om = row.byDecision['omit'];
    const delta = di.count > 0 && rt.count > 0 ? `${di.median - rt.median}` : '–';
    console.log(`| ${row.weekStart} | ${fmtAgg(di)} | ${fmtAgg(rt)} | ${fmtAgg(om)} | ${delta} |`);
  }
}

function printLargestSamples(records: CostRecord[]): void {
  const direct = records
    .filter((r) => r.routingDecision === 'direct-inject')
    .sort((a, b) => b.tokenEstimate - a.tokenEstimate)
    .slice(0, 5);
  if (direct.length === 0) return;
  console.log('');
  console.log('## Largest direct-inject spawns (top 5 by tokenEstimate)');
  console.log('');
  console.log('| spawnId | tokens | bytes | servers |');
  console.log('|---|---|---|---|');
  for (const r of direct) {
    const servers = r.serversIncluded.join(', ');
    console.log(
      `| ${r.spawnId.slice(0, 12)} | ${r.tokenEstimate} | ${r.mcpConfigBytes} | ${servers} |`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { records, skipped } = await readRecords(TELEMETRY_FILE);
  printHeader(records, skipped);
  if (records.length === 0) return;
  const rows = buildWeekRows(records);
  printWeekTable(rows);
  printLargestSamples(records);
}

main().catch((err) => {
  console.error('measure-mcp-token-cost: fatal error:', err);
  process.exit(1);
});
