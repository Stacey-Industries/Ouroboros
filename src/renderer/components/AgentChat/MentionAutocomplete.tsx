import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileEntry } from '../FileTree/FileListItem';

/* ---------- Mention types ---------- */

export type MentionType = 'file' | 'folder' | 'diff' | 'terminal';

export interface MentionItem {
  type: MentionType;
  /** Unique key for deduplication */
  key: string;
  /** Display label (file name, "Current Diff", etc.) */
  label: string;
  /** Full path or descriptor */
  path: string;
  /** Estimated token cost */
  estimatedTokens: number;
}

export interface MentionAutocompleteProps {
  /** Raw query text after the @ character */
  query: string;
  /** Available files for search */
  allFiles: FileEntry[];
  /** Already-selected mentions (for deduplication) */
  selectedMentions: MentionItem[];
  /** Called when a mention is selected */
  onSelect: (mention: MentionItem) => void;
  /** Called when the dropdown should close */
  onClose: () => void;
  /** Whether the dropdown is visible */
  isOpen: boolean;
}

/* ---------- Special mention definitions ---------- */

const SPECIAL_MENTIONS: Array<{ type: MentionType; label: string; description: string; key: string }> = [
  { type: 'diff', label: 'diff', description: 'Include current git diff as context', key: '@diff' },
  { type: 'terminal', label: 'terminal', description: 'Include last terminal output as context', key: '@terminal' },
];

const CHARS_PER_TOKEN = 4;
const MAX_RESULTS = 10;

/* ---------- Icons ---------- */

function FileIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DiffIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M3 12h18" />
    </svg>
  );
}

function TerminalIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function getMentionIcon(type: MentionType): React.ReactElement {
  switch (type) {
    case 'file': return <FileIcon />;
    case 'folder': return <FolderIcon />;
    case 'diff': return <DiffIcon />;
    case 'terminal': return <TerminalIcon />;
  }
}

function getMentionTypeColor(type: MentionType): string {
  switch (type) {
    case 'file': return 'var(--accent)';
    case 'folder': return '#e5c07b';
    case 'diff': return '#3fb950';
    case 'terminal': return '#b392f0';
  }
}

/* ---------- Result item type ---------- */

interface AutocompleteResult {
  mention: MentionItem;
  description?: string;
}

/* ---------- Component ---------- */

export function MentionAutocomplete({
  query,
  allFiles,
  selectedMentions,
  onSelect,
  onClose,
  isOpen,
}: MentionAutocompleteProps): React.ReactElement | null {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo((): AutocompleteResult[] => {
    if (!isOpen) return [];

    const selectedKeys = new Set(selectedMentions.map((m) => m.key));
    const items: AutocompleteResult[] = [];

    // Check for special mention prefixes
    const lowerQuery = query.toLowerCase();

    // Check if query matches folder: prefix
    const isFolderQuery = lowerQuery.startsWith('folder:');
    const folderSearchTerm = isFolderQuery ? lowerQuery.slice(7) : '';

    // Add special mentions that match the query
    for (const special of SPECIAL_MENTIONS) {
      if (selectedKeys.has(special.key)) continue;
      if (special.label.toLowerCase().startsWith(lowerQuery) || lowerQuery === '') {
        items.push({
          mention: {
            type: special.type,
            key: special.key,
            label: special.label,
            path: special.key,
            estimatedTokens: special.type === 'diff' ? 2000 : 1000, // Rough estimates
          },
          description: special.description,
        });
      }
    }

    if (isFolderQuery) {
      // Search directories
      const seenDirs = new Set<string>();
      for (const file of allFiles) {
        if (items.length >= MAX_RESULTS) break;
        const dir = file.dir;
        if (!dir || seenDirs.has(dir)) continue;
        seenDirs.add(dir);

        if (folderSearchTerm && !dir.toLowerCase().includes(folderSearchTerm)) continue;
        const key = `@folder:${dir}`;
        if (selectedKeys.has(key)) continue;

        items.push({
          mention: {
            type: 'folder',
            key,
            label: dir.split('/').pop() || dir,
            path: dir,
            estimatedTokens: 5000, // Rough estimate for folder context
          },
        });
      }
    } else {
      // Search files by name/path
      for (const file of allFiles) {
        if (items.length >= MAX_RESULTS) break;
        const key = `@file:${file.path}`;
        if (selectedKeys.has(key)) continue;

        if (query && !file.relativePath.toLowerCase().includes(lowerQuery) && !file.name.toLowerCase().includes(lowerQuery)) {
          continue;
        }

        items.push({
          mention: {
            type: 'file',
            key,
            label: file.name,
            path: file.relativePath,
            estimatedTokens: file.size > 0 ? Math.ceil(file.size / CHARS_PER_TOKEN) : 500,
          },
        });
      }
    }

    return items.slice(0, MAX_RESULTS);
  }, [isOpen, query, allFiles, selectedMentions]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeItem = listRef.current.querySelector('[data-active="true"]');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSelect(results[selectedIndex].mention);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      onSelect(results[selectedIndex].mention);
    }
  }, [isOpen, results, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || results.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[280px] overflow-y-auto rounded-lg border border-border-semantic shadow-lg bg-surface-base"
    >
      <div className="px-2 py-1.5 text-[10px] font-medium text-text-semantic-muted">
        Mentions
      </div>
      {results.map((result, index) => (
        <button
          key={result.mention.key}
          data-active={index === selectedIndex}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-75 text-text-semantic-primary${index === selectedIndex ? ' bg-surface-overlay' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(result.mention);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="shrink-0" style={{ color: getMentionTypeColor(result.mention.type) }}>
            {getMentionIcon(result.mention.type)}
          </span>
          <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {result.mention.type === 'file' || result.mention.type === 'folder'
              ? result.mention.path
              : result.mention.label
            }
          </span>
          {result.description && (
            <span className="shrink-0 text-[10px] text-text-semantic-muted">
              {result.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
