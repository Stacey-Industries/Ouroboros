/**
 * useContextPreview.ts — Aggregates what gets sent with the next prompt.
 *
 * Data sources:
 *   Rules    — active session's loadedRules from AgentEventsContext
 *   Skills   — active session's skillExecutions from AgentEventsContext
 *   Memory   — live entries from ~/.claude/projects/<slug>/memory/MEMORY.md (Phase E)
 *   Files    — pinned files + @mentions passed in as props
 *   Tools    — static list derived from Claude Code's built-in tools
 *   System   — model + effort from chatOverrides / settingsModel
 *
 * Token counts: byte-length approximation (÷ 4). A real tokenizer call
 * requires IPC and is deferred — see follow-ups in commit body.
 */

import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';
import { useMemo } from 'react';

import type { MemoryEntry } from '../types/electron-memory';

export type ContextItemKind = 'rule' | 'skill' | 'memory' | 'file' | 'mention' | 'tool' | 'system';

export type RuleGroup = 'user' | 'project';

export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  label: string;
  detail?: string;
  estimatedTokens: number;
  /** true by default; only file/mention/artifact kinds are user-toggleable */
  enabled: boolean;
  /** Wave 62 — sub-grouping for the Rules tab (user-level vs project-level). */
  group?: RuleGroup;
  /** Wave 63 — MCP server is disabled (registered but not active). */
  serverDisabled?: boolean;
}

/** Kinds that the user can toggle off before sending */
export const TOGGLEABLE_KINDS: ReadonlySet<ContextItemKind> = new Set(['file', 'mention', 'rule']);

/** Returns true if the item kind supports user toggling */
export function isToggleableKind(kind: ContextItemKind): boolean {
  return TOGGLEABLE_KINDS.has(kind);
}

/**
 * Wave 62 — encoded id form for togglable rules: `rule:<scope>:<name>`.
 * Non-toggleable rules (memoryType === 'Managed' or 'Local') keep the legacy
 * `rule:<filePath>` form so the popover renders the "managed" badge.
 */
export function parseRuleToggleId(
  id: string,
): { scope: 'global' | 'project'; name: string } | null {
  if (!id.startsWith('rule:')) return null;
  const rest = id.slice('rule:'.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  const scope = rest.slice(0, sep);
  const name = rest.slice(sep + 1);
  if (scope !== 'global' && scope !== 'project') return null;
  return { scope, name };
}

/**
 * Wave 62 — only files actually under `.claude/rules/` are toggleable. The CLI
 * reports CLAUDE.md / AGENTS.md / settings.local.json with the same memoryType
 * tags ('User' / 'Project') so we can't gate solely on memoryType. Path-check
 * the filePath segment to identify true rule files.
 */
function ruleScope(
  memoryType: LoadedRule['memoryType'],
  filePath: string,
): 'global' | 'project' | null {
  const inRulesDir =
    filePath.includes('/.claude/rules/') || filePath.includes('\\.claude\\rules\\');
  if (!inRulesDir) return null;
  if (memoryType === 'User') return 'global';
  if (memoryType === 'Project') return 'project';
  return null; // 'Local' and 'Managed' stay non-toggleable
}

function ruleGroup(memoryType: LoadedRule['memoryType']): RuleGroup {
  return memoryType === 'User' ? 'user' : 'project';
}

/** Wave 62 — Claude Code occasionally emits the same rule multiple times
 *  (one per loadReason). Dedup by (memoryType, filePath, name) tuple. */
function dedupLoadedRules(rules: LoadedRule[]): LoadedRule[] {
  const seen = new Set<string>();
  const out: LoadedRule[] = [];
  for (const r of rules) {
    const key = `${r.memoryType}::${r.filePath}::${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
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

/** Wave 63 — a single MCP server entry from the static config reader. */
export interface McpToolItem {
  /** MCP server name as registered in settings. */
  server: string;
  /** Whether the server is enabled in settings (false = disabled badge). */
  enabled: boolean;
}

export interface UseContextPreviewInput {
  effort?: string;
  loadedRules: LoadedRule[];
  mcpTools?: McpToolItem[];
  memoryEntries?: MemoryEntry[];
  mentionLabels: { estimatedTokens: number; label: string }[];
  model?: string;
  pinnedFileNames: { estimatedTokens: number; name: string; path: string }[];
  skillExecutions: SkillExecutionRecord[];
  /** Wave 82 — pasted/dropped attachments (images and external files). They
   *  surface under the Files tab so they're not invisible from the popover. */
  attachments?: { estimatedTokens: number; name: string }[];
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
  return dedupLoadedRules(rules).map((r) => {
    const scope = ruleScope(r.memoryType, r.filePath);
    const id = scope ? `rule:${scope}:${r.name}` : `rule:${r.filePath}`;
    return {
      detail: r.memoryType,
      enabled: true,
      estimatedTokens: approxTokens(r.filePath + r.name),
      group: ruleGroup(r.memoryType),
      id,
      kind: 'rule' as const,
      label: r.name,
    };
  });
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
  attachments: UseContextPreviewInput['attachments'] = [],
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
  // Wave 82 — attachments appear under Files (kind: 'file') so they're
  // visible in the popover. Distinguished by `attachment:` id prefix.
  const attachmentItems: ContextItem[] = attachments.map((a, i) => ({
    detail: 'attachment',
    enabled: true,
    estimatedTokens: a.estimatedTokens,
    id: `attachment:${i}:${a.name}`,
    kind: 'file' as const,
    label: a.name,
  }));
  return [...fileItems, ...attachmentItems, ...mentionItems];
}

// Verified against Claude Code 2.1.x as of 2026-04-30 (source: ericbuess/claude-code-docs
// agent-sdk__typescript.md + in-session tool surface). MCP tools deferred to Phase C.
// PowerShell is Windows-only; included unconditionally for display simplicity.
const BUILT_IN_TOOLS = [
  'Agent',
  'AskUserQuestion',
  'Bash',
  'CronCreate',
  'CronDelete',
  'CronList',
  'Edit',
  'EnterWorktree',
  'ExitPlanMode',
  'ExitWorktree',
  'Glob',
  'Grep',
  'LSP',
  'NotebookEdit',
  'PowerShell', // Windows-only
  'Read',
  'ScheduleWakeup',
  'SendMessage',
  'Skill',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskStop',
  'TaskUpdate',
  'TeamCreate',
  'TeamDelete',
  'TodoWrite',
  'ToolSearch',
  'WebFetch',
  'WebSearch',
  'Write',
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

/** Wave 63 Phase E — one ContextItem per MEMORY.md entry. */
export function buildMemoryItems(entries: MemoryEntry[]): ContextItem[] {
  return entries.map((e) => ({
    detail: e.description || e.section,
    enabled: true,
    estimatedTokens: approxTokens(e.title + (e.description ?? '')),
    id: `memory:${e.id}`,
    kind: 'memory' as const,
    label: e.title,
  }));
}

/** Wave 63 — one ContextItem per MCP server (server-level granularity). */
export function buildMcpToolItems(mcpTools: McpToolItem[]): ContextItem[] {
  return mcpTools.map((m) => ({
    detail: m.enabled ? undefined : 'disabled',
    enabled: true,
    estimatedTokens: approxTokens(m.server),
    id: `tool:mcp:${m.server}`,
    kind: 'tool' as const,
    label: m.server,
    serverDisabled: !m.enabled,
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
  files: 0,
  memory: 0,
  mentions: 0,
  rules: 0,
  skills: 0,
  system: 0,
  tools: 0,
};

const KIND_TO_TOTAL_KEY: Record<
  ContextItemKind,
  keyof Omit<ContextTotals, 'totalItems' | 'totalTokens'>
> = {
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
    const memoryItems = buildMemoryItems(input.memoryEntries ?? []);
    const fileItems = buildFileItems(input.pinnedFileNames, input.mentionLabels, input.attachments);
    const builtInItems = buildToolItems();
    const mcpItems = buildMcpToolItems(input.mcpTools ?? []);
    const toolItems = [...builtInItems, ...mcpItems];
    const systemItems = buildSystemItems(input.model, input.effort);
    const items = [
      ...ruleItems,
      ...skillItems,
      ...memoryItems,
      ...fileItems,
      ...toolItems,
      ...systemItems,
    ];
    return { items, totals: computeTotals(items) };
  }, [
    input.attachments,
    input.effort,
    input.loadedRules,
    input.mcpTools,
    input.memoryEntries,
    input.mentionLabels,
    input.model,
    input.pinnedFileNames,
    input.skillExecutions,
  ]);
}
