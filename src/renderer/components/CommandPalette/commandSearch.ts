import Fuse, { type IFuseOptions, type RangeTuple } from 'fuse.js';

import type { Command, CommandMatch } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RESULTS = 15;
const MAX_RECENT_SHOWN = 5;

// ─── Fuse.js config ──────────────────────────────────────────────────────────

export const FUSE_OPTIONS: IFuseOptions<Command> = {
  keys: [
    { name: 'label', weight: 0.7 },
    { name: 'category', weight: 0.3 },
  ],
  threshold: 0.45,
  distance: 100,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

// ─── Category display labels ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  app: 'App',
  file: 'File',
  view: 'View',
  terminal: 'Terminal',
  git: 'Git',
  extension: 'Extensions',
};

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

// ─── Tree flattening ─────────────────────────────────────────────────────────

/** Recursively collect all leaf commands (commands without children). */
export function flattenLeaves(commands: Command[]): Command[] {
  const result: Command[] = [];
  for (const cmd of commands) {
    if (Array.isArray(cmd.children) && cmd.children.length > 0) {
      result.push(...flattenLeaves(cmd.children));
    } else {
      result.push(cmd);
    }
  }
  return result;
}

/** Flatten all commands including parent nodes. */
export function flattenAll(commands: Command[]): Command[] {
  const result: Command[] = [];
  for (const cmd of commands) {
    result.push(cmd);
    if (Array.isArray(cmd.children) && cmd.children.length > 0) {
      result.push(...flattenAll(cmd.children));
    }
  }
  return result;
}

// ─── Match builders ──────────────────────────────────────────────────────────

export function buildRecentMatches(commands: Command[], recentIds: string[]): CommandMatch[] {
  const allLeaves = flattenLeaves(commands);
  const visible = recentIds
    .map((id) => allLeaves.find((c) => c.id === id))
    .filter((c): c is Command => c !== undefined && (c.when === undefined || c.when()));

  return visible.slice(0, MAX_RECENT_SHOWN).map((command) => ({
    command,
    matchIndices: [],
    score: 0,
  }));
}

export function buildFuseMatches(fuse: Fuse<Command>, query: string): CommandMatch[] {
  const results = fuse.search(query, { limit: MAX_RESULTS });

  return results
    .filter((r) => r.item.when === undefined || r.item.when())
    .map((r) => {
      const labelMatch = r.matches?.find((m) => m.key === 'label');
      const matchIndices = expandIndices(labelMatch?.indices);
      return { command: r.item, matchIndices, score: r.score ?? 0 };
    });
}

function expandIndices(indices: readonly RangeTuple[] | undefined): number[] {
  if (!indices) return [];
  const result: number[] = [];
  for (const [start, end] of indices) {
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
  }
  return result;
}

// ─── Category grouping ───────────────────────────────────────────────────────

export interface GroupedSection {
  category: string;
  matches: CommandMatch[];
}

export function groupByCategory(matches: CommandMatch[]): GroupedSection[] {
  const map = new Map<string, CommandMatch[]>();
  const order: string[] = [];

  for (const m of matches) {
    const cat = m.command.category ?? '';
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat)!.push(m);
  }

  return order.map((cat) => ({ category: cat, matches: map.get(cat)! }));
}
