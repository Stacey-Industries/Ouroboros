/**
 * lexicalMentionSearch.test.ts — unit tests for the BeautifulMentionsPlugin
 * search adapter and MentionItem round-trip.
 */
import { describe, expect, it } from 'vitest';

import type { MentionItem } from '../MentionAutocomplete';
import { buildMentionSearchFn, mentionItemFromData } from './lexicalMentionSearch';

/* ---------- fixtures ---------- */

const FILE_ENTRY = {
  name: 'fileUtils.ts',
  path: '/project/src/lib/fileUtils.ts',
  relativePath: 'src/lib/fileUtils.ts',
  dir: 'src/lib',
  size: 4000,
};

const FILE_MENTION: MentionItem = {
  key: '@file:/project/src/lib/fileUtils.ts',
  type: 'file',
  label: 'fileUtils.ts',
  path: 'src/lib/fileUtils.ts',
  estimatedTokens: 1000,
};

const SYMBOL_MENTION: MentionItem = {
  key: '@symbol:/project/src/lib/fileUtils.ts::parseConfig::10',
  type: 'symbol',
  label: 'parseConfig',
  path: '/project/src/lib/fileUtils.ts',
  estimatedTokens: 200,
  startLine: 10,
  endLine: 30,
  symbolType: 'function',
};

/* ---------- mentionItemFromData ---------- */

describe('mentionItemFromData', () => {
  it('round-trips a file MentionItem through flat data', () => {
    const data = {
      mentionKey: FILE_MENTION.key,
      mentionType: FILE_MENTION.type,
      mentionLabel: FILE_MENTION.label,
      mentionPath: FILE_MENTION.path,
      estimatedTokens: FILE_MENTION.estimatedTokens,
      startLine: -1,
      endLine: -1,
      symbolType: '',
    };
    const result = mentionItemFromData(data);
    expect(result).not.toBeNull();
    expect(result?.key).toBe(FILE_MENTION.key);
    expect(result?.type).toBe('file');
    expect(result?.path).toBe(FILE_MENTION.path);
    expect(result?.startLine).toBeUndefined();
    expect(result?.endLine).toBeUndefined();
    expect(result?.symbolType).toBeUndefined();
  });

  it('round-trips a symbol MentionItem preserving line numbers and symbolType', () => {
    const data = {
      mentionKey: SYMBOL_MENTION.key,
      mentionType: SYMBOL_MENTION.type,
      mentionLabel: SYMBOL_MENTION.label,
      mentionPath: SYMBOL_MENTION.path,
      estimatedTokens: SYMBOL_MENTION.estimatedTokens,
      startLine: 10,
      endLine: 30,
      symbolType: 'function',
    };
    const result = mentionItemFromData(data);
    expect(result).not.toBeNull();
    expect(result?.startLine).toBe(10);
    expect(result?.endLine).toBe(30);
    expect(result?.symbolType).toBe('function');
  });

  it('returns null when required string fields are missing', () => {
    expect(mentionItemFromData(undefined)).toBeNull();
    expect(mentionItemFromData({})).toBeNull();
    expect(mentionItemFromData({ mentionKey: 'k' })).toBeNull();
  });

  it('returns null when estimatedTokens is missing or wrong type', () => {
    const base = {
      mentionKey: 'k',
      mentionType: 'file',
      mentionLabel: 'l',
      mentionPath: 'p',
    };
    expect(mentionItemFromData(base)).toBeNull();
    expect(mentionItemFromData({ ...base, estimatedTokens: 'bad' })).toBeNull();
  });
});

/* ---------- buildMentionSearchFn ---------- */

describe('buildMentionSearchFn', () => {
  it('returns special mentions (diff/terminal/codebase) when query is empty', async () => {
    const search = buildMentionSearchFn({ allFiles: [], selectedMentions: [] });
    const results = await search('@', '');
    const values = results.map((r) => (typeof r === 'string' ? r : r.value));
    expect(values).toContain('diff');
    expect(values).toContain('terminal');
    expect(values).toContain('codebase');
  });

  it('filters results by query substring', async () => {
    const search = buildMentionSearchFn({
      allFiles: [FILE_ENTRY],
      selectedMentions: [],
    });
    const results = await search('@', 'fileUtils');
    const values = results.map((r) => (typeof r === 'string' ? r : r.value));
    expect(values.some((v) => v.includes('fileUtils'))).toBe(true);
  });

  it('excludes already-selected mentions', async () => {
    const search = buildMentionSearchFn({
      allFiles: [FILE_ENTRY],
      selectedMentions: [FILE_MENTION],
    });
    const results = await search('@', 'fileUtils');
    const values = results.map((r) => (typeof r === 'string' ? r : r.value));
    expect(values.every((v) => !v.includes('fileUtils'))).toBe(true);
  });

  it('embeds MentionItem data in the returned item', async () => {
    const search = buildMentionSearchFn({
      allFiles: [FILE_ENTRY],
      selectedMentions: [],
    });
    const results = await search('@', 'fileUtils');
    const match = results.find((r) => typeof r !== 'string' && r.value.includes('fileUtils'));
    expect(match).toBeDefined();
    if (typeof match !== 'string' && match) {
      expect(match['mentionType']).toBe('file');
      expect(match['mentionPath']).toBe('src/lib/fileUtils.ts');
    }
  });

  it('handles null query gracefully', async () => {
    const search = buildMentionSearchFn({ allFiles: [], selectedMentions: [] });
    const results = await search('@', null);
    expect(Array.isArray(results)).toBe(true);
  });
});
