/**
 * MentionAutocompleteSupport.ts — Builder helpers for MentionAutocomplete.
 * Extracted to keep MentionAutocomplete.tsx under the 300-line limit.
 */
import Fuse from 'fuse.js';

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

const FILE_FUSE_OPTIONS = {
  keys: [{ name: 'name', weight: 0.6 }, { name: 'relativePath', weight: 0.4 }],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
  includeScore: true,
};

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
      estimatedTokens: Math.ceil(lines * 40 / CHARS_PER_TOKEN),
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

function buildFolderMentionsSubstring(
  query: string,
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  const lowerQuery = query.toLowerCase();
  const seenDirs = new Set<string>();
  for (const file of allFiles) {
    if (items.length >= MAX_RESULTS) break;
    const dir = file.dir;
    if (!dir || seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    if (lowerQuery && !dir.toLowerCase().includes(lowerQuery)) continue;
    if (!selectedKeys.has(`@folder:${dir}`)) items.push(buildFolderMentionResult(dir));
  }
}

export function buildFolderMentions(
  query: string,
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  buildFolderMentionsSubstring(query, allFiles, selectedKeys, items);
}

function buildFileMentionsFuzzy(
  query: string,
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  const fuse = new Fuse(allFiles, FILE_FUSE_OPTIONS);
  const results = fuse.search(query, { limit: MAX_RESULTS });
  for (const result of results) {
    if (items.length >= MAX_RESULTS) break;
    const file = result.item;
    if (!selectedKeys.has(`@file:${file.path}`)) items.push(buildFileMentionResult(file));
  }
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
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  if (query) {
    buildFileMentionsFuzzy(query, allFiles, selectedKeys, items);
  } else {
    buildFileMentionsAll(allFiles, selectedKeys, items);
  }
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
  allFiles: FileEntry[];
  selectedMentions: MentionItem[];
  isOpen: boolean;
  symbolResults?: SymbolGraphNode[];
}

export function buildMentionResults(args: BuildMentionResultsArgs): AutocompleteResult[] {
  const { query, allFiles, selectedMentions, isOpen, symbolResults } = args;
  if (!isOpen) return [];
  const selectedKeys = new Set(selectedMentions.map((mention) => mention.key));
  const items: AutocompleteResult[] = [];
  buildSpecialMentions(query, selectedKeys, items);
  buildFileMentions(query, allFiles, selectedKeys, items);
  if (items.length < MAX_RESULTS) buildFolderMentions(query, allFiles, selectedKeys, items);
  if (symbolResults?.length && items.length < MAX_RESULTS) {
    buildSymbolMentions(query, selectedKeys, items, symbolResults);
  }
  return items.slice(0, MAX_RESULTS);
}
