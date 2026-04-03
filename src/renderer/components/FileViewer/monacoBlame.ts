/**
 * monacoBlame.ts — Data transformations for rendering git blame in Monaco.
 *
 * Converts BlameLine[] from useGitBlame into Monaco-compatible decorations
 * using InjectedTextOptions (inline ghost text at end of line, GitLens-style).
 */
import * as monaco from 'monaco-editor';

import type { BlameLine } from '../../types/electron';

export interface BlameDecoration {
  lineNumber: number;
  author: string;
  date: string;
  hash: string;
  summary: string;
  isGroupStart: boolean;
  fullAuthor: string;
  timestamp: number;
}

function relativeDate(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Date.now() / 1000 - timestamp;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

function shortAuthor(author: string): string {
  if (!author) return '';
  const first = author.split(/\s+/)[0];
  return first.length > 10 ? first.slice(0, 10) : first;
}

export function getBlameHslColor(hash: string): string {
  if (!hash || hash.startsWith('00000000')) return 'transparent';
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  return `hsla(${hue}, 40%, 50%, 0.08)`;
}

export function blameLinesToDecorations(blameLines: BlameLine[]): BlameDecoration[] {
  const decorations: BlameDecoration[] = [];
  let prevHash: string | null = null;

  for (const bl of blameLines) {
    const isGroupStart = bl.hash !== prevHash;
    decorations.push({
      lineNumber: bl.line,
      author: shortAuthor(bl.author),
      date: relativeDate(bl.date),
      hash: bl.hash,
      summary: bl.summary,
      isGroupStart,
      fullAuthor: bl.author,
      timestamp: bl.date,
    });
    prevHash = bl.hash;
  }
  return decorations;
}

function buildHoverMessage(d: BlameDecoration): monaco.IMarkdownString {
  const dateStr = d.timestamp ? new Date(d.timestamp * 1000).toLocaleString() : '';
  return {
    value: [
      `\`${d.hash.slice(0, 8)}\` &nbsp; **${d.fullAuthor}**`,
      dateStr,
      '',
      d.summary,
    ].join('\n\n'),
    isTrusted: true,
  };
}

export function blameDecorationsToMonaco(
  decorations: BlameDecoration[],
): monaco.editor.IModelDeltaDecoration[] {
  return decorations.map((d) => {
    const text = d.isGroupStart ? `  ${d.author}, ${d.date}` : '';
    return {
      range: new monaco.Range(d.lineNumber, 1, d.lineNumber, 1),
      options: {
        after: text ? {
          content: text,
          inlineClassName: 'blame-inline-decoration',
          cursorStops: monaco.editor.InjectedTextCursorStops.None,
        } : undefined,
        isWholeLine: true,
        className: `blame-line-bg`,
        hoverMessage: d.isGroupStart ? buildHoverMessage(d) : undefined,
      },
    };
  });
}
