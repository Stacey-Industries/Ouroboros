/**
 * agentChatExportImport.ts — IPC handlers for thread export and import.
 *
 * Split from agentChat.ts to keep that file under the 300-line ESLint limit.
 * Re-uses the same `register` / `requireValidString` helpers via parameters.
 */

import type { AgentChatService } from '../agentChat';
import { exportToHtml, exportToJson, exportToMarkdown } from '../agentChat/threadExport';
import { importFromJson, importFromTranscript } from '../agentChat/threadImport';

type RegisterFn = (
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
) => void;

type RequireStringFn = (value: unknown, name: string) => string;

export interface ExportImportHandlerOptions {
  channels: string[];
  svc: AgentChatService;
  register: RegisterFn;
  requireValidString: RequireStringFn;
  exportChannel: string;
  importChannel: string;
}

export function registerExportImportHandlers(opts: ExportImportHandlerOptions): void {
  const { channels, svc, register, requireValidString, exportChannel, importChannel } = opts;
  register(channels, exportChannel, (threadId, format) =>
    handleExportThread(svc, requireValidString, threadId, format),
  );
  register(channels, importChannel, (content, format) =>
    handleImportThread(svc, requireValidString, content, format),
  );
}

async function handleExportThread(
  svc: AgentChatService,
  requireValidString: RequireStringFn,
  threadId: unknown,
  format: unknown,
) {
  const id = requireValidString(threadId, 'threadId');
  const fmt = requireValidString(format, 'format');
  if (fmt !== 'markdown' && fmt !== 'json' && fmt !== 'html') {
    return { success: false, error: `Invalid format: ${fmt}` };
  }
  const result = await svc.loadThread(id);
  if (!result.success || !result.thread) {
    return { success: false, error: result.error ?? 'Thread not found' };
  }
  const { thread } = result;
  let content: string;
  if (fmt === 'markdown') content = exportToMarkdown(thread, thread.messages);
  else if (fmt === 'json') content = exportToJson(thread, thread.messages);
  else content = exportToHtml(thread, thread.messages);
  return { success: true, content };
}

async function handleImportThread(
  svc: AgentChatService,
  requireValidString: RequireStringFn,
  content: unknown,
  format: unknown,
) {
  const text = requireValidString(content, 'content');
  const fmt = requireValidString(format, 'format');
  if (fmt !== 'json' && fmt !== 'transcript') {
    return { success: false, error: `Invalid format: ${fmt}` };
  }
  const imported = fmt === 'json' ? importFromJson(text) : importFromTranscript(text);
  if (!imported) return { success: false, error: 'Failed to parse input' };
  const { thread: t, messages } = imported;
  const created = await svc.threadStore.createThread(
    { workspaceRoot: t.workspaceRoot || '.', title: t.title },
    { messages, status: 'idle' },
  );
  if (t.tags && t.tags.length > 0) {
    await svc.threadStore.setTags(created.id, t.tags);
  }
  return { success: true, threadId: created.id };
}
