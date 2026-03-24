/**
 * MentionAutocompleteSupport.ts — Builder helpers for MentionAutocomplete.
 * Extracted to keep MentionAutocomplete.tsx under the 300-line limit.
 */
import type { FileEntry } from '../FileTree/FileListItem';
import type { MentionItem, MentionType } from './MentionAutocomplete';

export const CHARS_PER_TOKEN = 4;
export const MAX_RESULTS = 10;

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
];

export function getMentionTypeColor(type: MentionType): string {
  if (type === 'file') return 'var(--interactive-accent)';
  if (type === 'folder') return '#e5c07b';
  if (type === 'diff') return 'var(--status-success)';
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

export function buildFolderMentions(
  query: string,
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  const lowerQuery = query.toLowerCase();
  const folderSearchTerm = lowerQuery.slice(7);
  const seenDirs = new Set<string>();
  for (const file of allFiles) {
    if (items.length >= MAX_RESULTS) break;
    const dir = file.dir;
    if (!dir || seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    if (folderSearchTerm && !dir.toLowerCase().includes(folderSearchTerm)) continue;
    if (!selectedKeys.has(`@folder:${dir}`)) items.push(buildFolderMentionResult(dir));
  }
}

export function buildFileMentions(
  query: string,
  allFiles: FileEntry[],
  selectedKeys: Set<string>,
  items: AutocompleteResult[],
): void {
  const lowerQuery = query.toLowerCase();
  for (const file of allFiles) {
    if (items.length >= MAX_RESULTS) break;
    if (selectedKeys.has(`@file:${file.path}`)) continue;
    if (
      query &&
      !file.relativePath.toLowerCase().includes(lowerQuery) &&
      !file.name.toLowerCase().includes(lowerQuery)
    )
      continue;
    items.push(buildFileMentionResult(file));
  }
}

export function buildMentionResults(
  query: string,
  allFiles: FileEntry[],
  selectedMentions: MentionItem[],
  isOpen: boolean,
): AutocompleteResult[] {
  if (!isOpen) return [];
  const selectedKeys = new Set(selectedMentions.map((mention) => mention.key));
  const items: AutocompleteResult[] = [];
  const lowerQuery = query.toLowerCase();
  buildSpecialMentions(query, selectedKeys, items);
  if (lowerQuery.startsWith('folder:')) buildFolderMentions(query, allFiles, selectedKeys, items);
  else buildFileMentions(query, allFiles, selectedKeys, items);
  return items.slice(0, MAX_RESULTS);
}
