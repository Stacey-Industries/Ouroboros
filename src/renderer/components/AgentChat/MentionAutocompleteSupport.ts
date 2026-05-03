/**
 * MentionAutocompleteSupport.ts — Builder helpers for MentionAutocomplete.
 * Extracted to keep MentionAutocomplete.tsx under the 300-line limit.
 */
import type { FileEntry } from '../FileTree/FileListItem';
import type { MentionItem, MentionType, SymbolGraphNode } from './MentionAutocomplete';

export const CHARS_PER_TOKEN = 4;
export const MAX_RESULTS = 25;

export type AutocompleteResult = { mention: MentionItem; description?: string };

export const SPECIAL_MENTIONS: Array<{
  type: MentionType;
  label: string;
  description: string;
  key: string;
}> = [
  { type: 'diff', label: 'diff', description: 'Include current git diff as context', key: '@diff' },
  {
    type: 'terminal',
    label: 'terminal',
    description: 'Include last terminal output as context',
    key: '@terminal',
  },
  {
    type: 'codebase',
    label: 'codebase',
    description: 'Semantic search across the codebase at send time',
    key: '@codebase',
  },
];

export function getMentionTypeColor(type: MentionType): string {
  if (type === 'file') return 'var(--interactive-accent)';
  if (type === 'folder') return '#e5c07b';
  if (type === 'diff') return 'var(--status-success)';
  if (type === 'symbol') return 'var(--status-info)';
  if (type === 'codebase') return 'var(--status-warning)';
  return 'var(--palette-purple)';
}

export function buildSpecialMentionResult(
  special: (typeof SPECIAL_MENTIONS)[number],
): AutocompleteResult {
  return {
    mention: {
      type: special.type,
      key: special.key,
      label: special.label,
      path: special.key,
      estimatedTokens: special.type === 'diff' ? 2000 : 1000,
    },
    description: special.description,
  };
}

export function buildFolderMentionResult(dir: string): AutocompleteResult {
  return {
    mention: {
      type: 'folder',
      key: `@folder:${dir}`,
      label: dir.split('/').pop() || dir,
      path: dir,
      estimatedTokens: 5000,
    },
  };
}

export function buildFileMentionResult(file: FileEntry): AutocompleteResult {
  return {
    mention: {
      type: 'file',
      key: `@file:${file.path}`,
      label: file.name,
      path: file.relativePath,
      estimatedTokens: file.size > 0 ? Math.ceil(file.size / CHARS_PER_TOKEN) : 500,
    },
  };
}

export function buildSymbolMentionResult(node: SymbolGraphNode): AutocompleteResult {
  const endLine = node.endLine ?? node.line + 20;
  const lines = endLine - node.line;
  return {
    mention: {
      type: 'symbol',
      key: `@symbol:${node.filePath}::${node.name}::${node.line}`,
      label: node.name,
      path: node.filePath,
      estimatedTokens: Math.ceil((lines * 40) / CHARS_PER_TOKEN),
      startLine: node.line,
      endLine: node.endLine,
      symbolType: node.type,
    },
    description: `${node.type} in ${node.filePath.split('/').pop() ?? node.filePath}`,
  };
}

export function buildSpecialMentions(
  query: string,
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  const lowerQuery = query.toLowerCase();
  for (const special of SPECIAL_MENTIONS) {
    if (
      !selectedKeys.has(special.key) &&
      (special.label.toLowerCase().startsWith(lowerQuery) || lowerQuery === '')
    ) {
      items.push(buildSpecialMentionResult(special));
    }
  }
}

/**
 * Cached file-mention search structures. Build once per `allFiles` change;
 * reuse across keystrokes to avoid re-deduping dirs.
 *
 * Note: file matching is plain ranked substring (see `buildFileMentions`),
 * not Fuse fuzzy search. Fuse.search on a 5K-file index measured 300-450ms
 * per query — substring is single-digit ms with similar UX for typed paths.
 */
export interface FileMentionIndex {
  files: FileEntry[];
  uniqueDirs: string[];
}

export function buildFileMentionIndex(allFiles: FileEntry[]): FileMentionIndex {
  const seenDirs = new Set<string>();
  const uniqueDirs: string[] = [];
  for (const file of allFiles) {
    const dir = file.dir;
    if (!dir || seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    uniqueDirs.push(dir);
  }
  return { files: allFiles, uniqueDirs };
}

function buildFolderMentionsSubstring(
  query: string,
  uniqueDirs: string[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  const lowerQuery = query.toLowerCase();
  for (const dir of uniqueDirs) {
    if (items.length >= MAX_RESULTS) break;
    if (lowerQuery && !dir.toLowerCase().includes(lowerQuery)) continue;
    if (!selectedKeys.has(`@folder:${dir}`)) items.push(buildFolderMentionResult(dir));
  }
}

export function buildFolderMentions(
  query: string,
  index: FileMentionIndex,
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  buildFolderMentionsSubstring(query, index.uniqueDirs, selectedKeys, items);
}

/**
 * Score a substring match. Lower is better. Returns null if no match.
 * Ranks: basename-prefix < basename-mid < dirname. Within a tier, matches
 * earlier in the path beat later ones. This mirrors VS Code's quick-open
 * heuristic and is what users actually expect when typing path fragments.
 */
function scoreFileMatch(relativePath: string, lowerQuery: string): number | null {
  const lowerPath = relativePath.toLowerCase();
  const matchIdx = lowerPath.indexOf(lowerQuery);
  if (matchIdx === -1) return null;
  const slashIdx = lowerPath.lastIndexOf('/');
  const basenameStart = slashIdx + 1;
  if (matchIdx >= basenameStart) {
    return matchIdx === basenameStart ? matchIdx : 1000 + (matchIdx - basenameStart);
  }
  return 10000 + matchIdx;
}

function buildFileMentionsAll(
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  for (const file of allFiles) {
    if (items.length >= MAX_RESULTS) break;
    if (!selectedKeys.has(`@file:${file.path}`)) items.push(buildFileMentionResult(file));
  }
}

export function buildFileMentions(
  query: string,
  index: FileMentionIndex,
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  if (!query) {
    buildFileMentionsAll(index.files, selectedKeys, items);
    return;
  }
  const lowerQuery = query.toLowerCase();
  const matches: { file: FileEntry; score: number }[] = [];
  for (const file of index.files) {
    if (selectedKeys.has(`@file:${file.path}`)) continue;
    const score = scoreFileMatch(file.relativePath, lowerQuery);
    if (score === null) continue;
    matches.push({ file, score });
  }
  matches.sort((a, b) => a.score - b.score);
  const limit = Math.min(matches.length, MAX_RESULTS - items.length);
  for (let i = 0; i < limit; i++) items.push(buildFileMentionResult(matches[i].file));
}

function looksLikeSymbolQuery(query: string): boolean {
  return query.length >= 2 && !query.includes('/') && !query.includes('.');
}

function buildSymbolMentions(
  query: string,
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
  symbolResults: SymbolGraphNode[],
): void {
  if (!looksLikeSymbolQuery(query)) return;
  for (const node of symbolResults) {
    if (items.length >= MAX_RESULTS) break;
    const key = `@symbol:${node.filePath}::${node.name}::${node.line}`;
    if (!selectedKeys.has(key)) items.push(buildSymbolMentionResult(node));
  }
}

export interface BuildMentionResultsArgs {
  query: string;
  fileIndex: FileMentionIndex;
  selectedMentions: MentionItem[];
  isOpen: boolean;
  symbolResults?: SymbolGraphNode[];
}

export function buildMentionResults(args: BuildMentionResultsArgs): AutocompleteResult[] {
  const { query, fileIndex, selectedMentions, isOpen, symbolResults } = args;
  if (!isOpen) return [];
  const selectedKeys = new Set(selectedMentions.map((mention) => mention.key));
  const items: AutocompleteResult[] = [];
  buildSpecialMentions(query, selectedKeys, items);
  buildFileMentions(query, fileIndex, selectedKeys, items);
  if (items.length < MAX_RESULTS) buildFolderMentions(query, fileIndex, selectedKeys, items);
  if (symbolResults?.length && items.length < MAX_RESULTS) {
    buildSymbolMentions(query, selectedKeys, items, symbolResults);
  }
  return items.slice(0, MAX_RESULTS);
}
