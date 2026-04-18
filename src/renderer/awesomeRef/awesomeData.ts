/**
 * awesomeData.ts — Types and curated entry list for "Awesome Ouroboros".
 *
 * Wave 37 Phase E. Content ships with the app (no fetch). Contribute via PR.
 * Seed entries live in awesomeEntries.ts to keep each file under 300 lines.
 *
 * installAction is intentionally absent for hook entries — hook placement
 * varies per user and must be manual. See AwesomeRefPanel for guidance.
 */

import { ALL_ENTRIES } from './awesomeEntries';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AwesomeCategory = 'hooks' | 'slash-commands' | 'mcp-configs' | 'rules' | 'skills';

export interface InstallAction {
  kind: 'rule' | 'skill' | 'hook';
  payload: Record<string, unknown>;
}

export interface AwesomeEntry {
  id: string;
  category: AwesomeCategory;
  title: string;
  description: string;
  author?: string;
  content: string;
  tags?: readonly string[];
  installAction?: InstallAction;
}

// ── Public data ───────────────────────────────────────────────────────────────

/** Full curated list — sourced from awesomeEntries.ts. */
export const AWESOME_ENTRIES: readonly AwesomeEntry[] = ALL_ENTRIES;

/** All distinct categories present in AWESOME_ENTRIES. */
export const AWESOME_CATEGORIES: readonly AwesomeCategory[] = [
  'hooks',
  'slash-commands',
  'mcp-configs',
  'rules',
  'skills',
];
