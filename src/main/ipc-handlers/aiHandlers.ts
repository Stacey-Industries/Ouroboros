/**
 * AI IPC handlers — inline completions and future AI-powered features.
 *
 * Uses the Anthropic SDK via OAuth (createAnthropicClient) for all API calls.
 * Streaming inline edit (Wave 6 #116) uses claude -p stream-json — see aiStreamHandler.ts.
 */
import { ipcMain } from 'electron';

import type { AiInlineEditRequest, AiInlineEditResponse } from '../../renderer/types/electron-ai';
import { getConfigValue } from '../config';
import log from '../logger';
import { createAnthropicClient } from '../orchestration/providers/anthropicAuth';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const INLINE_EDIT_MODEL = 'claude-sonnet-4-6';

let activeController: AbortController | null = null;

function resolveModel(slotValue: string): string {
  return slotValue || DEFAULT_MODEL;
}

function buildFimPrompt(
  before: string,
  after: string,
  openTabs?: Array<{ filePath: string; snippet: string }>,
): string {
  const parts: string[] = [];

  if (openTabs?.length) {
    parts.push('Context from open files:');
    for (const tab of openTabs) {
      parts.push(`--- ${tab.filePath} ---`);
      parts.push(tab.snippet);
    }
    parts.push('');
  }

  parts.push(`<fim_prefix>${before}</fim_prefix>`);
  parts.push(`<fim_suffix>${after}</fim_suffix>`);
  parts.push('<fim_middle>');

  return parts.join('\n');
}

const SYSTEM_PROMPT = [
  'You are a code completion engine.',
  'Complete the code at the cursor position.',
  'Only output the completion text, nothing else.',
  'No explanations, no markdown fences.',
].join(' ');

interface CompletionRequest {
  filePath: string;
  languageId: string;
  textBeforeCursor: string;
  textAfterCursor: string;
  openTabContext?: Array<{ filePath: string; snippet: string }>;
}

type CompletionResult = { success: boolean; completion?: string; error?: string };

function extractCompletion(response: { content: Array<{ type: string; text?: string }> }): string {
  return response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function classifyError(err: unknown): CompletionResult {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401') || msg.includes('Unauthorized')) {
    return {
      success: false,
      error: 'OAuth token may have expired. Run `claude auth login` to re-authenticate.',
    };
  }
  log.warn('[ai:inline-completion] error:', msg);
  return { success: false };
}

async function callAnthropicApi(
  request: CompletionRequest,
  signal: AbortSignal,
): Promise<CompletionResult> {
  const slots = getConfigValue('modelSlots');
  const model = resolveModel(slots?.inlineCompletion ?? '');
  const client = await createAnthropicClient();
  const prompt = buildFimPrompt(request.textBeforeCursor, request.textAfterCursor, request.openTabContext);

  const response = await client.messages.create(
    {
      model,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stop_sequences: ['\n\n', '</fim_middle>'],
    },
    { signal },
  );

  if (signal.aborted) return { success: false };
  const text = extractCompletion(response);
  return text ? { success: true, completion: text } : { success: false };
}

async function handleInlineCompletion(
  _event: Electron.IpcMainInvokeEvent,
  request: CompletionRequest,
): Promise<CompletionResult> {
  if (!getConfigValue('inlineCompletionsEnabled')) return { success: false, error: 'disabled' };

  if (activeController) {
    activeController.abort();
    activeController = null;
  }
  const controller = new AbortController();
  activeController = controller;

  try {
    return await callAnthropicApi(request, controller.signal);
  } catch (err: unknown) {
    if (controller.signal.aborted) return { success: false };
    return classifyError(err);
  } finally {
    if (activeController === controller) activeController = null;
  }
}

// ── Commit message generation ─────────────────────────────────────────────

const COMMIT_SYSTEM_PROMPT = [
  'Generate a concise git commit message for these changes.',
  'Follow conventional commit format: type(scope): description',
  'Types: feat, fix, refactor, docs, test, chore, style, perf',
  'Keep the first line under 72 characters.',
  'Add a blank line then a brief body (2-3 sentences) if the changes are complex.',
].join('\n');

const MAX_DIFF_LENGTH = 16_000;

interface CommitMessageRequest {
  diff: string;
  recentCommits?: string;
}

type CommitMessageResult = { success: boolean; message?: string; error?: string };

function buildCommitPrompt(request: CommitMessageRequest): string {
  const diff =
    request.diff.length > MAX_DIFF_LENGTH
      ? request.diff.slice(0, MAX_DIFF_LENGTH) + '\n... (truncated)'
      : request.diff;
  const parts: string[] = [];
  if (request.recentCommits) {
    parts.push(`Recent commit messages for style reference:\n${request.recentCommits}\n`);
  }
  parts.push(`Diff:\n${diff}`);
  return parts.join('\n');
}

async function handleGenerateCommitMessage(
  _event: Electron.IpcMainInvokeEvent,
  request: CommitMessageRequest,
): Promise<CommitMessageResult> {
  try {
    const client = await createAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      system: COMMIT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildCommitPrompt(request) }],
      stop_sequences: ['\n\n\n'],
    });
    const text = extractCompletion(response);
    return text ? { success: true, message: text } : { success: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return { success: false, error: 'No AI credentials configured' };
    }
    log.warn('[ai:generate-commit-message] error:', msg);
    return { success: false, error: msg };
  }
}

// ── Inline edit (Ctrl+K) ─────────────────────────────────────────────────────

let editController: AbortController | null = null;

function buildInlineEditPrompt(req: AiInlineEditRequest): string {
  const { filePath, languageId, selectedCode, selectionRange, instruction } = req;
  return [
    'Edit the following code according to the instruction.',
    'Return ONLY the edited code, no explanations, no markdown fences.',
    '',
    `File: ${filePath} (${languageId})`,
    `Lines ${selectionRange.startLine}-${selectionRange.endLine}`,
    '',
    '<code>',
    selectedCode,
    '</code>',
    '',
    `Instruction: ${instruction}`,
  ].join('\n');
}

function classifyEditError(err: unknown): AiInlineEditResponse {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401') || msg.includes('Unauthorized')) {
    return {
      success: false,
      error: 'OAuth token may have expired. Run `claude auth login` to re-authenticate.',
    };
  }
  log.warn('[ai:inline-edit] error:', msg);
  return { success: false, error: msg };
}

async function callInlineEditApi(
  req: AiInlineEditRequest,
  signal: AbortSignal,
): Promise<AiInlineEditResponse> {
  const client = await createAnthropicClient();
  const response = await client.messages.create(
    {
      model: INLINE_EDIT_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildInlineEditPrompt(req) }],
    },
    { signal },
  );
  if (signal.aborted) return { success: false };
  const editedCode = extractCompletion(response);
  return editedCode ? { success: true, editedCode } : { success: false };
}

async function handleInlineEdit(
  _event: Electron.IpcMainInvokeEvent,
  req: AiInlineEditRequest,
): Promise<AiInlineEditResponse> {
  if (editController) {
    editController.abort();
    editController = null;
  }
  const controller = new AbortController();
  editController = controller;

  try {
    return await callInlineEditApi(req, controller.signal);
  } catch (err: unknown) {
    if (controller.signal.aborted) return { success: false };
    return classifyEditError(err);
  } finally {
    if (editController === controller) editController = null;
  }
}

export function registerAiHandlers(): string[] {
  const channels: string[] = [];
  ipcMain.handle('ai:inline-completion', handleInlineCompletion);
  channels.push('ai:inline-completion');
  ipcMain.handle('ai:generate-commit-message', handleGenerateCommitMessage);
  channels.push('ai:generate-commit-message');
  ipcMain.handle('ai:inline-edit', handleInlineEdit);
  channels.push('ai:inline-edit');
  return channels;
}
