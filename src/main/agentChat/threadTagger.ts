/**
 * threadTagger.ts — Pure, synchronous auto-tag derivation for chat threads.
 *
 * `deriveTags` maps file extensions / tool names / git context into lowercase
 * tag strings. `mergeTags` folds auto-tags (prefixed `auto:`) and manual tags
 * into a single deduplicated sorted list.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface TagInput {
  filesTouched: string[];
  toolsUsed: string[];
  language?: string;
  gitBranch?: string;
  profileId?: string;
}

// ── Extension → language map ──────────────────────────────────────────

const EXT_TO_LANG: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  swift: 'swift',
  kt: 'kotlin',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  sql: 'sql',
};

// Tools that are too common to be useful as tags
const NOISY_TOOLS = new Set(['Read', 'read']);

// ── Helpers ───────────────────────────────────────────────────────────

function extFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return '';
  return filePath.slice(dot + 1).toLowerCase();
}

function langTagsFromFiles(files: string[]): Set<string> {
  const langs = new Set<string>();
  for (const f of files) {
    const lang = EXT_TO_LANG[extFromPath(f)];
    if (lang) langs.add(lang);
  }
  return langs;
}

function toolTagsFromUsed(tools: string[]): Set<string> {
  const result = new Set<string>();
  for (const t of tools) {
    if (!NOISY_TOOLS.has(t) && t.trim().length > 0) {
      result.add(t.trim().toLowerCase());
    }
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Derive auto-tags from structured thread activity.
 * Pure and synchronous — safe to call in hot code paths.
 */
export function deriveTags(input: TagInput): string[] {
  const tags: string[] = [];

  for (const lang of langTagsFromFiles(input.filesTouched)) tags.push(lang);
  for (const tool of toolTagsFromUsed(input.toolsUsed)) tags.push(tool);

  if (input.language) tags.push(input.language.toLowerCase());
  if (input.gitBranch) tags.push(`branch:${input.gitBranch}`);
  if (input.profileId) tags.push(`profile:${input.profileId}`);

  return [...new Set(tags)].sort();
}

/**
 * Merge auto-derived and manually-set tags.
 *
 * - Auto-tags are prefixed with `auto:`.
 * - Manual tags are kept as-is.
 * - Result is deduplicated and sorted stably (manual before auto within each group).
 */
export function mergeTags(auto: string[], manual: string[]): string[] {
  const autoSet = new Set(auto.map((t) => `auto:${t}`));
  const manualSet = new Set(manual);
  const all = new Set([...manualSet, ...autoSet]);
  return [...all].sort();
}
