/**
 * LexicalMentionMenuItem.tsx — custom menuItemComponent for BeautifulMentionsPlugin.
 *
 * Mirrors the visual styling of MentionResult in MentionAutocomplete.tsx:
 * file/folder/diff/terminal/codebase/symbol icons + type-specific colors.
 *
 * Uses item.value and item.displayValue (NOT the deprecated itemValue / label
 * props — Risk 9.4 from Phase A audit §2d).
 */
import type { BeautifulMentionsMenuItemProps } from 'lexical-beautiful-mentions';
import React from 'react';

import type { MentionType } from '../MentionAutocomplete';
import { getMentionTypeColor } from '../MentionAutocompleteSupport';

/* ---------- icons (copied from MentionAutocomplete.tsx) ---------- */

function FileIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DiffIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18M3 12h18" />
    </svg>
  );
}

function TerminalIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function SymbolIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
    </svg>
  );
}

function getMentionIcon(type: MentionType): React.ReactElement {
  if (type === 'file') return <FileIcon />;
  if (type === 'folder') return <FolderIcon />;
  if (type === 'diff') return <DiffIcon />;
  if (type === 'symbol') return <SymbolIcon />;
  return <TerminalIcon />;
}

/* ---------- component ---------- */

/**
 * Custom menu item for BeautifulMentionsPlugin.
 * Uses item.value / item.displayValue per audit §2d (NOT deprecated itemValue/label).
 */
export const LexicalMentionMenuItem = React.forwardRef<
  HTMLLIElement,
  BeautifulMentionsMenuItemProps
>(function LexicalMentionMenuItem({ selected, item, ...rest }, ref) {
  // item.data carries the serialized MentionItem fields written by lexicalMentionSearch.ts
  const mentionType = (item.data?.['mentionType'] as MentionType | undefined) ?? 'file';
  const color = getMentionTypeColor(mentionType);

  const startLine =
    typeof item.data?.['startLine'] === 'number' && (item.data['startLine'] as number) >= 0
      ? (item.data['startLine'] as number)
      : undefined;

  return (
    <li
      ref={ref}
      data-active={selected}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-75 text-text-semantic-primary${selected ? ' bg-surface-overlay' : ''}`}
      {...rest}
    >
      <span className="shrink-0" style={{ color }}>
        {getMentionIcon(mentionType)}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
        {item.displayValue}
      </span>
      {startLine != null && (
        <span className="shrink-0 text-[10px] text-text-semantic-faint">:{startLine}</span>
      )}
    </li>
  );
});
