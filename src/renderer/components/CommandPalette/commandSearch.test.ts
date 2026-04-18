/**
 * commandSearch.test.ts — Wave 38 Phase D
 * Tests for rankCommands: name/description/tags weighted scoring,
 * stable sort, fuzzy subsequence, and empty-query passthrough.
 */

import { describe, expect, it } from 'vitest';

import { rankCommands } from './commandSearch';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMMANDS = [
  { label: 'Open Settings', description: 'Configure IDE preferences', tags: ['config', 'prefs'] },
  { label: 'Toggle Terminal', description: 'Show or hide the terminal panel', tags: ['panel'] },
  { label: 'marketplace:open', description: 'Browse docs packs and extensions', tags: ['docs', 'plugins'] },
  { label: 'Git Time Travel', description: 'Browse commit history snapshots', tags: ['git', 'history'] },
  { label: 'Open Usage Dashboard', description: 'View token and cost statistics', tags: ['stats'] },
] as const;

// ─── Empty query ──────────────────────────────────────────────────────────────

describe('rankCommands — empty query', () => {
  it('returns all commands with score 0 in original order', () => {
    const result = rankCommands(COMMANDS, '');
    expect(result).toHaveLength(COMMANDS.length);
    expect(result.map((r) => r.score)).toEqual(COMMANDS.map(() => 0));
    expect(result.map((r) => r.command.label)).toEqual(COMMANDS.map((c) => c.label));
  });

  it('returns all commands when query is whitespace only', () => {
    const result = rankCommands(COMMANDS, '   ');
    expect(result).toHaveLength(COMMANDS.length);
  });
});

// ─── Name match ──────────────────────────────────────────────────────────────

describe('rankCommands — name match', () => {
  it('exact prefix match has highest score', () => {
    const result = rankCommands(COMMANDS, 'Open');
    const names = result.map((r) => r.command.label);
    expect(names[0]).toBe('Open Settings');
    expect(result[0].matchedField).toBe('name');
  });

  it('name prefix wins over description substring', () => {
    // "settings" is in the label of cmd[0] and description of cmd[1] doesn't match
    // "config" tag matches cmd[0]; "Toggle" is a name prefix for cmd[1]
    const result = rankCommands(COMMANDS, 'Toggle');
    expect(result[0].command.label).toBe('Toggle Terminal');
    expect(result[0].matchedField).toBe('name');
  });

  it('non-matching commands are excluded', () => {
    const result = rankCommands(COMMANDS, 'zzzzunmatchable');
    expect(result).toHaveLength(0);
  });
});

// ─── Description match ───────────────────────────────────────────────────────

describe('rankCommands — description match', () => {
  it('description match is included with lower score than name match', () => {
    // "Configure" is only in the description of "Open Settings"
    const result = rankCommands(COMMANDS, 'Configure');
    const match = result.find((r) => r.command.label === 'Open Settings');
    expect(match).toBeDefined();
    expect(match?.matchedField).toBe('description');
  });

  it('description match score is lower than a name prefix match score', () => {
    // "Open" matches name of "Open Settings" and "Open Usage Dashboard"
    // "docs" matches description and tags of marketplace:open; no name match
    const openResults = rankCommands(COMMANDS, 'Open');
    const docsResults = rankCommands(COMMANDS, 'docs');
    const openTopScore = openResults[0]?.score ?? 0;
    const docsTopScore = docsResults[0]?.score ?? 0;
    // Name prefix score should exceed description-only score
    expect(openTopScore).toBeGreaterThan(docsTopScore);
  });

  it('typing "docs" finds marketplace:open via description', () => {
    const result = rankCommands(COMMANDS, 'docs');
    const marketplace = result.find((r) => r.command.label === 'marketplace:open');
    expect(marketplace).toBeDefined();
    // matchedField should be 'description' or 'tags' (description has "docs packs")
    expect(['description', 'tags']).toContain(marketplace?.matchedField);
  });
});

// ─── Tag match ────────────────────────────────────────────────────────────────

describe('rankCommands — tag match', () => {
  it('tag match is included when no name/description matches', () => {
    // "prefs" is only in the tags of "Open Settings"
    const result = rankCommands(COMMANDS, 'prefs');
    expect(result).toHaveLength(1);
    expect(result[0].command.label).toBe('Open Settings');
    expect(result[0].matchedField).toBe('tags');
  });

  it('tag match score is lower than description match score', () => {
    // Compare "Configure" (description match) vs "prefs" (tags-only match) for Open Settings
    const descResult = rankCommands(COMMANDS, 'Configure');
    const tagResult = rankCommands(COMMANDS, 'prefs');
    const descScore = descResult.find((r) => r.command.label === 'Open Settings')?.score ?? 0;
    const tagScore = tagResult.find((r) => r.command.label === 'Open Settings')?.score ?? 0;
    expect(descScore).toBeGreaterThan(tagScore);
  });
});

// ─── Stable sort ──────────────────────────────────────────────────────────────

describe('rankCommands — stable sort', () => {
  it('same-score commands maintain original order', () => {
    // Both "config" and "prefs" are tags of "Open Settings", but let's use a
    // query that hits multiple commands at equal score: "panel"
    // "Toggle Terminal" has tag "panel", "Git Time Travel" does not match
    // For stability we need multiple commands with equal score
    const cmds = [
      { label: 'Alpha', description: 'panel view', tags: [] as readonly string[] },
      { label: 'Beta', description: 'panel view', tags: [] as readonly string[] },
      { label: 'Gamma', description: 'panel view', tags: [] as readonly string[] },
    ] as const;
    const result = rankCommands(cmds, 'panel');
    expect(result.map((r) => r.command.label)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

// ─── Fuzzy subsequence ────────────────────────────────────────────────────────

describe('rankCommands — fuzzy subsequence', () => {
  it('matches consecutive-letter subsequence in label', () => {
    // "gstt" is a subsequence of "Git Time Travel" (G, t, T, t via consecutive scan)
    // More reliably: "GTT" → G(it) T(ime) T(ravel) has consecutive chars G, T, T
    const result = rankCommands(COMMANDS, 'GTT');
    const match = result.find((r) => r.command.label === 'Git Time Travel');
    expect(match).toBeDefined();
  });

  it('non-subsequence returns no match', () => {
    // "xyz" cannot be found as a subsequence in any command label
    const result = rankCommands(COMMANDS, 'xyz');
    expect(result).toHaveLength(0);
  });

  it('fuzzy match score is lower than substring match score', () => {
    const cmds = [
      { label: 'Abc def', description: undefined, tags: undefined },
      { label: 'AbbbbC', description: undefined, tags: undefined },
    ] as const;
    // "Abc" is a substring of "Abc def" but not of "AbbbbC"; "Abc" IS a subsequence of "AbbbbC"
    const result = rankCommands(cmds, 'Abc');
    const substrMatch = result.find((r) => r.command.label === 'Abc def');
    const fuzzyMatch = result.find((r) => r.command.label === 'AbbbbC');
    expect(substrMatch).toBeDefined();
    expect(fuzzyMatch).toBeDefined();
    expect((substrMatch?.score ?? 0)).toBeGreaterThan((fuzzyMatch?.score ?? 0));
  });
});
