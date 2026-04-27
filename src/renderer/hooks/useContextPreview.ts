/**
 * useContextPreview.ts — Aggregates what gets sent with the next prompt.
 *
 * Data sources:
 *   Rules    — active session's loadedRules from AgentEventsContext
 *   Skills   — active session's skillExecutions from AgentEventsContext
 *   Memory   — not yet wired (no IPC surface to read MEMORY.md from renderer)
 *   Files    — pinned files + @mentions passed in as props
 *   Tools    — static list derived from Claude Code's built-in tools
 *   System   — model + effort from chatOverrides / settingsModel
 *
 * Token counts: byte-length approximation (÷ 4). A real tokenizer call
 * requires IPC and is deferred — see follow-ups in commit body.
 */

import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';
import { useMemo } from 'react';

export type ContextItemKind = 'rule' | 'skill' | 'memory' | 'file' | 'mention' | 'tool' | 'system';

export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  label: string;
  detail?: string;
  estimatedTokens: number;
  /** true by default; only file/mention/artifact kinds are user-toggleable */
  enabled: boolean;
}

/** Kinds that the user can toggle off before sending */
export const TOGGLEABLE_KINDS: ReadonlySet<ContextItemKind> = new Set(['file', 'mention']);

/** Returns true if the item kind supports user toggling */
export function isToggleableKind(kind: ContextItemKind): boolean {
  return TOGGLEABLE_KINDS.has(kind);
}

export interface ContextTotals {
  files: number;
  memory: number;
  mentions: number;
  rules: number;
  skills: number;
  system: number;
  tools: number;
  totalItems: number;
  totalTokens: number;
}

export interface ContextPreviewModel {
  items: ContextItem[];
  totals: ContextTotals;
}

export interface UseContextPreviewInput {
  effort?: string;
  loadedRules: LoadedRule[];
  mentionLabels: { estimatedTokens: number; label: string }[];
  model?: string;
  pinnedFileNames: { estimatedTokens: number; name: string; path: string }[];
  skillExecutions: SkillExecutionRecord[];
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;

function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------

function buildRuleItems(rules: LoadedRule[]): ContextItem[] {
  return rules.map((r) => ({
    detail: r.memoryType,
    enabled: true,
    estimatedTokens: approxTokens(r.filePath + r.name),
    id: `rule:${r.filePath}`,
    kind: 'rule' as const,
    label: r.name,
  }));
}

function buildSkillItems(skills: SkillExecutionRecord[]): ContextItem[] {
  return skills.map((s) => ({
    detail: s.agentType,
    enabled: true,
    estimatedTokens: approxTokens(s.skillName),
    id: `skill:${s.skillName}:${s.startedAt}`,
    kind: 'skill' as const,
    label: s.skillName,
  }));
}

function buildFileItems(
  pinnedFiles: UseContextPreviewInput['pinnedFileNames'],
  mentions: UseContextPreviewInput['mentionLabels'],
): ContextItem[] {
  const fileItems: ContextItem[] = pinnedFiles.map((f) => ({
    detail: f.path,
    enabled: true,
    estimatedTokens: f.estimatedTokens,
    id: `file:${f.path}`,
    kind: 'file' as const,
    label: f.name,
  }));
  const mentionItems: ContextItem[] = mentions.map((m, i) => ({
    enabled: true,
    estimatedTokens: m.estimatedTokens,
    id: `mention:${i}:${m.label}`,
    kind: 'mention' as const,
    label: m.label,
  }));
  return [...fileItems, ...mentionItems];
}

const BUILT_IN_TOOLS = [
  'Bash', 'Edit', 'Glob', 'Grep', 'LS',
  'Read', 'Task', 'TodoRead', 'TodoWrite', 'WebFetch', 'Write',
];

export const BUILT_IN_TOOLS_COUNT = BUILT_IN_TOOLS.length;

function buildToolItems(): ContextItem[] {
  return BUILT_IN_TOOLS.map((t) => ({
    enabled: true,
    estimatedTokens: approxTokens(t),
    id: `tool:${t}`,
    kind: 'tool' as const,
    label: t,
  }));
}

function buildSystemItems(model?: string, effort?: string): ContextItem[] {
  if (!model) return [];
  return [
    {
      detail: effort,
      enabled: true,
      estimatedTokens: approxTokens(model),
      id: 'system:model',
      kind: 'system' as const,
      label: model,
    },
  ];
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

const ZERO_TOTALS: Omit<ContextTotals, 'totalItems' | 'totalTokens'> = {
  files: 0, memory: 0, mentions: 0, rules: 0, skills: 0, system: 0, tools: 0,
};

const KIND_TO_TOTAL_KEY: Record<ContextItemKind, keyof Omit<ContextTotals, 'totalItems' | 'totalTokens'>> = {
  file: 'files',
  memory: 'memory',
  mention: 'mentions',
  rule: 'rules',
  skill: 'skills',
  system: 'system',
  tool: 'tools',
};

function computeTotals(items: ContextItem[]): ContextTotals {
  const acc = { ...ZERO_TOTALS, totalItems: items.length, totalTokens: 0 };
  for (const item of items) {
    acc[KIND_TO_TOTAL_KEY[item.kind]] += 1;
    acc.totalTokens += item.estimatedTokens;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContextPreview(input: UseContextPreviewInput): ContextPreviewModel {
  return useMemo(() => {
    const ruleItems = buildRuleItems(input.loadedRules);
    const skillItems = buildSkillItems(input.skillExecutions);
    const fileItems = buildFileItems(input.pinnedFileNames, input.mentionLabels);
    const toolItems = buildToolItems();
    const systemItems = buildSystemItems(input.model, input.effort);
    const items = [...ruleItems, ...skillItems, ...fileItems, ...toolItems, ...systemItems];
    return { items, totals: computeTotals(items) };
  }, [
    input.effort,
    input.loadedRules,
    input.mentionLabels,
    input.model,
    input.pinnedFileNames,
    input.skillExecutions,
  ]);
}
