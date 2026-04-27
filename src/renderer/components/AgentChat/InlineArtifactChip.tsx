/**
 * InlineArtifactChip.tsx — Clickable pill shown in assistant messages when the
 * agent writes or edits an HTML file.  Click opens the file in preview mode
 * via the existing `agent-ide:open-file` event (HTML files now default to
 * preview mode since Wave 59 Phase H).
 */
import React, { useCallback } from 'react';

import { OPEN_FILE_EVENT } from '../../hooks/appEventNames';
import type { AgentChatContentBlock } from '../../types/electron';

// ── constants ─────────────────────────────────────────────────────────────────

const FILE_MODIFYING_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'write_file',
  'edit_file',
  'multi_edit',
  'create_file',
]);

const HTML_EXTENSION_RE = /\.html?$/i;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Extract distinct HTML file paths written/edited in this message's blocks. */
export function extractHtmlArtifactPaths(blocks: AgentChatContentBlock[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const block of blocks) {
    if (
      block.kind === 'tool_use' &&
      block.status === 'complete' &&
      FILE_MODIFYING_TOOLS.has(block.tool) &&
      block.filePath &&
      HTML_EXTENSION_RE.test(block.filePath) &&
      !seen.has(block.filePath)
    ) {
      seen.add(block.filePath);
      paths.push(block.filePath);
    }
  }
  return paths;
}

function getBaseName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

// ── sub-components ────────────────────────────────────────────────────────────

function HtmlIcon(): React.ReactElement {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

interface ChipProps {
  filePath: string;
}

function ArtifactChipButton({ filePath }: ChipProps): React.ReactElement {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent(OPEN_FILE_EVENT, { detail: { filePath } }));
    },
    [filePath],
  );
  const name = getBaseName(filePath);
  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Preview ${filePath}`}
      aria-label={`Open ${name} in preview`}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] leading-tight transition-colors duration-100 hover:opacity-80"
      style={{
        backgroundColor: 'var(--interactive-accent-subtle)',
        borderColor: 'var(--interactive-accent)',
        color: 'var(--interactive-accent)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <HtmlIcon />
      <span>{name}</span>
      <span
        className="ml-0.5 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide opacity-80"
        style={{ backgroundColor: 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)' }}
      >
        Preview
      </span>
    </button>
  );
}

// ── public component ──────────────────────────────────────────────────────────

export interface InlineArtifactChipBarProps {
  blocks: AgentChatContentBlock[];
  isStreaming: boolean;
}

/**
 * Renders a row of preview chips for each HTML file written/edited in
 * the message.  Returns null when there are no HTML artifacts or while
 * the message is still streaming (paths may still change).
 */
export function InlineArtifactChipBar({
  blocks,
  isStreaming,
}: InlineArtifactChipBarProps): React.ReactElement | null {
  if (isStreaming) return null;
  const paths = extractHtmlArtifactPaths(blocks);
  if (paths.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {paths.map((p) => (
        <ArtifactChipButton key={p} filePath={p} />
      ))}
    </div>
  );
}
