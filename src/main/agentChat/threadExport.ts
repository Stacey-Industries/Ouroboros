/**
 * threadExport.ts — Pure export functions for chat threads.
 *
 * All functions are pure (no Electron imports) — they take data as input
 * and return serialized string output. No side-effects.
 *
 * Formats:
 *   - Markdown: readable conversation transcript
 *   - JSON: structured, importable representation
 *   - HTML: self-contained, shareable chat layout
 */

import type { AgentChatContentBlock, AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'markdown' | 'json' | 'html';

// ─── Markdown export ──────────────────────────────────────────────────────────

function renderToolBlock(block: AgentChatContentBlock & { kind: 'tool_use' }): string {
  const inputPreview =
    typeof block.input === 'string'
      ? block.input.slice(0, 120)
      : JSON.stringify(block.input ?? {}).slice(0, 120);
  return `[Tool: ${block.tool}] ${inputPreview}`;
}

function renderBlocksForMarkdown(blocks: AgentChatContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === 'text') return b.content;
      if (b.kind === 'thinking') return `> *Thinking:* ${b.content.slice(0, 200)}`;
      if (b.kind === 'tool_use') return renderToolBlock(b);
      if (b.kind === 'code') return `\`\`\`${b.language}\n${b.content}\n\`\`\``;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function renderMessageBody(msg: AgentChatMessageRecord): string {
  if (msg.blocks && msg.blocks.length > 0) return renderBlocksForMarkdown(msg.blocks);
  return msg.content;
}

function formatIsoTime(ms: number): string {
  return new Date(ms).toISOString();
}

export function exportToMarkdown(
  thread: AgentChatThreadRecord,
  messages: AgentChatMessageRecord[],
): string {
  const title = thread.title || thread.id;
  const tags = thread.tags && thread.tags.length > 0 ? thread.tags.join(', ') : '';
  const headerLines = [
    `# Thread: ${title}`,
    `Created: ${formatIsoTime(thread.createdAt)}`,
    tags ? `Tags: ${tags}` : '',
    '---',
  ].filter((l) => l !== '');

  const messageSections = messages.map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const time = formatIsoTime(msg.createdAt);
    return [`## [${role}] at ${time}`, renderMessageBody(msg)].join('\n');
  });

  return [...headerLines, '', ...messageSections].join('\n\n');
}

// ─── JSON export ──────────────────────────────────────────────────────────────

interface ThreadJsonExport {
  thread: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    workspaceRoot: string;
    tags: string[];
    status: string;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    blocks?: AgentChatContentBlock[];
  }>;
}

export function exportToJson(
  thread: AgentChatThreadRecord,
  messages: AgentChatMessageRecord[],
): string {
  const payload: ThreadJsonExport = {
    thread: {
      id: thread.id,
      title: thread.title || thread.id,
      createdAt: formatIsoTime(thread.createdAt),
      updatedAt: formatIsoTime(thread.updatedAt),
      workspaceRoot: thread.workspaceRoot,
      tags: thread.tags ?? [],
      status: thread.status,
    },
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: formatIsoTime(msg.createdAt),
      ...(msg.blocks ? { blocks: msg.blocks } : {}),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ─── HTML export ──────────────────────────────────────────────────────────────

const HTML_STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0e0e10; color: #e2e2e2; margin: 0; padding: 24px; }
  .thread-header { border-bottom: 1px solid #2a2a2e; padding-bottom: 16px; margin-bottom: 24px; }
  .thread-header h1 { font-size: 1.4rem; color: #f0f0f0; margin: 0 0 6px; }
  .thread-header .meta { font-size: 0.8rem; color: #888; }
  .message { display: flex; gap: 12px; margin-bottom: 20px; }
  .message.user { flex-direction: row-reverse; }
  .bubble { max-width: 72%; padding: 12px 16px; border-radius: 12px;
            font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;
            word-break: break-word; }
  .message.user .bubble { background: #2563eb; color: #fff; border-radius: 12px 12px 2px 12px; }
  .message.assistant .bubble { background: #1e1e23; border: 1px solid #2a2a2e;
                                 color: #e2e2e2; border-radius: 2px 12px 12px 12px; }
  .role-label { font-size: 0.7rem; color: #888; margin-bottom: 4px; text-align: right; }
  .message.assistant .role-label { text-align: left; }
  .tool-block { background: #13131a; border: 1px solid #2a2a2e; border-radius: 6px;
                padding: 8px 12px; margin: 8px 0; font-size: 0.8rem; color: #a78bfa; }
`.trim();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBlocksForHtml(blocks: AgentChatContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === 'text') return `<span>${escapeHtml(b.content)}</span>`;
      if (b.kind === 'tool_use') {
        const preview = JSON.stringify(b.input ?? {}).slice(0, 100);
        return `<div class="tool-block">⚡ ${escapeHtml(b.tool)}: ${escapeHtml(preview)}</div>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

function renderHtmlMessage(msg: AgentChatMessageRecord): string {
  const role = msg.role === 'assistant' ? 'assistant' : 'user';
  const label = role === 'user' ? 'You' : 'Assistant';
  const body =
    msg.blocks && msg.blocks.length > 0
      ? renderBlocksForHtml(msg.blocks)
      : `<span>${escapeHtml(msg.content)}</span>`;
  return [
    `<div class="message ${role}">`,
    `  <div>`,
    `    <div class="role-label">${label}</div>`,
    `    <div class="bubble">${body}</div>`,
    `  </div>`,
    `</div>`,
  ].join('\n');
}

export function exportToHtml(
  thread: AgentChatThreadRecord,
  messages: AgentChatMessageRecord[],
): string {
  const title = escapeHtml(thread.title || thread.id);
  const tags = (thread.tags ?? []).map(escapeHtml).join(', ');
  const created = formatIsoTime(thread.createdAt);
  const metaLine = [
    `Created: ${created}`,
    tags ? `Tags: ${tags}` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const header = [
    '<div class="thread-header">',
    `  <h1>${title}</h1>`,
    `  <div class="meta">${metaLine}</div>`,
    '</div>',
  ].join('\n');

  const body = messages.map(renderHtmlMessage).join('\n\n');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <title>${title}</title>`,
    `  <style>${HTML_STYLE}</style>`,
    '</head>',
    '<body>',
    header,
    body,
    '</body>',
    '</html>',
  ].join('\n');
}
