/**
 * chatTitleDerivation.ts — Smart thread title generation from response content and tool activity.
 */

import path from 'path';

import log from '../logger';
import { DEFAULT_THREAD_TITLE } from './threadStoreSupport';

const TITLE_MAX_LENGTH = 80;

const EDIT_TOOLS = new Set([
  'Edit',
  'edit_file',
  'MultiEdit',
  'multi_edit',
  'Write',
  'write_file',
  'create_file',
  'NotebookEdit',
]);
const READ_TOOLS = new Set(['Read', 'read_file']);
const SEARCH_TOOLS = new Set(['Grep', 'search_files', 'Glob', 'find_files']);
const BASH_TOOLS = new Set(['Bash', 'execute_command']);

export function buildThreadTitle(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return DEFAULT_THREAD_TITLE;
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

function truncateTitle(title: string): string {
  return title.length <= TITLE_MAX_LENGTH
    ? title
    : `${title.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

interface ToolClassification {
  editFiles: string[];
  readFiles: string[];
  hasSearch: boolean;
  hasBash: boolean;
}

function applyToolToClassification(
  tool: { name: string; filePath?: string },
  result: ToolClassification,
): void {
  const basename = tool.filePath ? path.basename(tool.filePath) : undefined;
  if (EDIT_TOOLS.has(tool.name) && basename) {
    if (!result.editFiles.includes(basename)) result.editFiles.push(basename);
  } else if (READ_TOOLS.has(tool.name) && basename) {
    if (!result.readFiles.includes(basename)) result.readFiles.push(basename);
  } else if (SEARCH_TOOLS.has(tool.name)) {
    result.hasSearch = true;
  } else if (BASH_TOOLS.has(tool.name)) {
    result.hasBash = true;
  }
}

function classifyTools(toolsUsed: Array<{ name: string; filePath?: string }>): ToolClassification {
  const result: ToolClassification = {
    editFiles: [],
    readFiles: [],
    hasSearch: false,
    hasBash: false,
  };
  for (const tool of toolsUsed) {
    applyToolToClassification(tool, result);
  }
  return result;
}

function formatFileLabel(files: string[], fallback: string): string {
  if (files.length === 0) return fallback;
  return files.length <= 2 ? files.join(', ') : `${files[0]} +${files.length - 1} more`;
}

function titleFromEdits(verb: string, editFiles: string[]): string | null {
  if (editFiles.length === 0) return null;
  const fileLabel = formatFileLabel(editFiles, '');
  return truncateTitle(`${verb || 'Update'} — ${fileLabel}`);
}

function titleFromReads(verb: string, tools: ToolClassification): string | null {
  if (tools.readFiles.length === 0 && !tools.hasSearch) return null;
  const fileLabel =
    tools.readFiles.length > 0
      ? tools.readFiles.length <= 2
        ? tools.readFiles.join(', ')
        : `${tools.readFiles.length} files`
      : 'codebase';
  return truncateTitle(`${verb || 'Explore'} — ${fileLabel}`);
}

function titleFromResponseText(responseText: string): string | null {
  if (responseText.length <= 20) return null;
  const firstSentence = responseText
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .find((s) => s.length > 10 && s.length < 80);
  return firstSentence ? truncateTitle(firstSentence) : null;
}

/**
 * Extracts a short action verb/phrase from the user prompt.
 */
function extractActionVerb(prompt: string): string | null {
  const normalized = prompt.trim();
  const verbMatch = normalized.match(
    /^(fix|add|update|refactor|remove|delete|create|implement|move|rename|debug|optimize|improve|clean\s*up|set\s*up|configure|install|migrate|convert|replace|merge|split|extract|rewrite|simplify|test|document)\b(.{0,40}?)(?:\s+(?:in|for|from|to|the|this|my|our|a|an)\b|$)/i,
  );
  if (!verbMatch) return null;
  const phrase = (verbMatch[1] + verbMatch[2]).trim();
  const capitalized = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return capitalized.length <= 40 ? capitalized : capitalized.slice(0, 37).trimEnd() + '...';
}

/**
 * Generates a smarter thread title from the first assistant response and tool activity.
 */
export function deriveSmartTitle(args: {
  userPrompt: string;
  responseText: string;
  toolsUsed: Array<{ name: string; filePath?: string }>;
}): string | null {
  const tools = classifyTools(args.toolsUsed);
  const actionVerb = extractActionVerb(args.userPrompt);

  return (
    titleFromEdits(actionVerb ?? '', tools.editFiles) ??
    titleFromReads(actionVerb ?? '', tools) ??
    (tools.hasBash ? actionVerb || 'Run commands' : null) ??
    titleFromResponseText(args.responseText)
  );
}

/**
 * Calls Claude Haiku to generate a concise, descriptive thread title.
 * Returns null on any failure so the heuristic title stays.
 */
export async function generateLlmTitle(args: {
  userPrompt: string;
  responseText: string;
  toolsUsed: Array<{ name: string; filePath?: string }>;
}): Promise<string | null> {
  try {
    return await callHaikuForTitle(args);
  } catch (error) {
    log.warn(
      'LLM title generation failed (heuristic title preserved):',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function callHaikuForTitle(args: {
  userPrompt: string;
  responseText: string;
  toolsUsed: Array<{ name: string; filePath?: string }>;
}): Promise<string | null> {
  const { spawnClaude } = await import('../claudeMdGeneratorSupport');

  const toolSummary = buildToolSummaryForTitle(args.toolsUsed);
  const responsePreview =
    args.responseText.length > 600 ? args.responseText.slice(0, 600) + '...' : args.responseText;

  const prompt = `Generate a concise title (4-8 words, no quotes, no period) for this coding conversation.\n\nUser request: ${args.userPrompt.slice(0, 300)}\n\n${toolSummary}\n\nAssistant response (excerpt): ${responsePreview}\n\nTitle:`;

  const text = (await spawnClaude(prompt, 'haiku')).trim();
  if (!text || text.length < 3 || text.length > TITLE_MAX_LENGTH) return null;
  return text.replace(/^["']+|["'.]+$/g, '').trim() || null;
}

function buildToolSummaryForTitle(toolsUsed: Array<{ name: string; filePath?: string }>): string {
  if (toolsUsed.length === 0) return '';
  const uniqueTools = [...new Set(toolsUsed.map((t) => t.name))].join(', ');
  const files =
    [...new Set(toolsUsed.map((t) => t.filePath).filter(Boolean))].slice(0, 5).join(', ') || 'none';
  return `Tools used: ${uniqueTools}. Files: ${files}.`;
}
