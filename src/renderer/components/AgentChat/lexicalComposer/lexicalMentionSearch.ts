/**
 * lexicalMentionSearch.ts — adapter between BeautifulMentionsPlugin.onSearch
 * and the existing buildMentionResults infrastructure.
 *
 * `onSearch` is called by BeautifulMentionsPlugin with (trigger, query).
 * Returns Promise<BeautifulMentionsItem[]>.  Each item embeds the full
 * MentionItem as flat primitives in `data` so LexicalMentionBridge can
 * reconstruct it on selection / addition without a separate lookup.
 */
import type { BeautifulMentionsItem } from 'lexical-beautiful-mentions';

import type { FileEntry } from '../../FileTree/FileListItem';
import type { MentionItem, SymbolGraphNode } from '../MentionAutocomplete';
import {
  buildFileMentionIndex,
  buildMentionResults,
  type FileMentionIndex,
} from '../MentionAutocompleteSupport';

/** Flat representation of MentionItem stored in BeautifulMentionsItem.data. */
export type MentionItemData = {
  mentionKey: string;
  mentionType: string;
  mentionLabel: string;
  mentionPath: string;
  estimatedTokens: number;
  startLine: number;
  endLine: number;
  symbolType: string;
};

type RawData = Record<string, string | boolean | number | null> | undefined;

function extractRequiredStrings(data: RawData): {
  key: string;
  type: string;
  label: string;
  path: string;
} | null {
  if (!data) return null;
  const { mentionKey: key, mentionType: type, mentionLabel: label, mentionPath: path } = data;
  if (
    typeof key !== 'string' ||
    typeof type !== 'string' ||
    typeof label !== 'string' ||
    typeof path !== 'string'
  ) {
    return null;
  }
  return { key, type, label, path };
}

function extractOptionalFields(data: NonNullable<RawData>): {
  estimatedTokens: number;
  startLine?: number;
  endLine?: number;
  symbolType?: string;
} | null {
  const tokens = data['estimatedTokens'];
  if (typeof tokens !== 'number') return null;
  const startLine =
    typeof data['startLine'] === 'number' && data['startLine'] >= 0 ? data['startLine'] : undefined;
  const endLine =
    typeof data['endLine'] === 'number' && data['endLine'] >= 0 ? data['endLine'] : undefined;
  const symbolType =
    typeof data['symbolType'] === 'string' && data['symbolType'] !== ''
      ? data['symbolType']
      : undefined;
  return { estimatedTokens: tokens, startLine, endLine, symbolType };
}

function toData(mention: MentionItem): MentionItemData {
  return {
    mentionKey: mention.key,
    mentionType: mention.type,
    mentionLabel: mention.label,
    mentionPath: mention.path,
    estimatedTokens: mention.estimatedTokens,
    startLine: mention.startLine ?? -1,
    endLine: mention.endLine ?? -1,
    symbolType: mention.symbolType ?? '',
  };
}

/** Reconstruct a MentionItem from the data stored in a BeautifulMentionNode. */
export function mentionItemFromData(data: RawData): MentionItem | null {
  const required = extractRequiredStrings(data);
  if (!required) return null;
  const optional = extractOptionalFields(data as NonNullable<RawData>);
  if (!optional) return null;
  return {
    key: required.key,
    type: required.type as MentionItem['type'],
    label: required.label,
    path: required.path,
    ...optional,
  };
}

function toBeautifulItem(mention: MentionItem): BeautifulMentionsItem & { value: string } {
  // value is what BeautifulMentionsPlugin displays in the chip.
  // Files/folders/symbols: use path. Specials (diff/terminal/codebase): use label.
  const value =
    mention.type === 'file' || mention.type === 'folder' || mention.type === 'symbol'
      ? mention.path
      : mention.label;
  return { value, ...toData(mention) } as BeautifulMentionsItem & { value: string };
}

export interface MentionSearchArgs {
  allFiles: FileEntry[];
  selectedMentions: MentionItem[];
  symbolResults?: SymbolGraphNode[];
}

/**
 * Build the onSearch handler for BeautifulMentionsPlugin.
 * Captures allFiles, selectedMentions, symbolResults in a closure so the
 * returned function always reflects the latest values.
 */
export function buildMentionSearchFn(
  args: MentionSearchArgs,
): (trigger: string, query?: string | null) => Promise<BeautifulMentionsItem[]> {
  const fileIndex: FileMentionIndex = buildFileMentionIndex(args.allFiles);
  return async (_trigger: string, query?: string | null): Promise<BeautifulMentionsItem[]> => {
    const results = buildMentionResults({
      query: query ?? '',
      fileIndex,
      selectedMentions: args.selectedMentions,
      isOpen: true,
      symbolResults: args.symbolResults,
    });
    return results.map((r) => toBeautifulItem(r.mention));
  };
}
