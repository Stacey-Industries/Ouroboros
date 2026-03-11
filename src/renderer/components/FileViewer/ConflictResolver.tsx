import React, { useState, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConflictBlock {
  /** 0-based index of the <<<<<<< line */
  startLine: number;
  /** 0-based index of the ======= line */
  dividerLine: number;
  /** 0-based index of the >>>>>>> line */
  endLine: number;
  oursLabel: string;
  theirsLabel: string;
  oursLines: string[];
  theirsLines: string[];
}

export interface ConflictResolverProps {
  content: string;
  filePath: string;
  onResolved: (newContent: string) => void;
}

// ─── Detection & parsing ──────────────────────────────────────────────────────

export function hasConflictMarkers(content: string): boolean {
  return (
    content.includes('<<<<<<<') &&
    content.includes('=======') &&
    content.includes('>>>>>>>')
  );
}

export function parseConflictBlocks(lines: string[]): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const startLine = i;
      const oursLabel = lines[i].replace('<<<<<<<', '').trim();
      const oursLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].startsWith('=======')) {
        oursLines.push(lines[i]);
        i++;
      }

      const dividerLine = i;
      const theirsLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirsLines.push(lines[i]);
        i++;
      }

      const theirsLabel = lines[i]?.replace('>>>>>>>', '').trim() ?? '';
      const endLine = i;

      blocks.push({
        startLine,
        dividerLine,
        endLine,
        oursLabel,
        theirsLabel,
        oursLines,
        theirsLines,
      });
    }
    i++;
  }

  return blocks;
}

// ─── Resolve helper ───────────────────────────────────────────────────────────

function resolveBlock(
  lines: string[],
  block: ConflictBlock,
  choice: 'ours' | 'theirs' | 'both'
): string[] {
  const replacement =
    choice === 'ours'
      ? block.oursLines
      : choice === 'theirs'
      ? block.theirsLines
      : [...block.oursLines, ...block.theirsLines];

  return [
    ...lines.slice(0, block.startLine),
    ...replacement,
    ...lines.slice(block.endLine + 1),
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ConflictCardProps {
  block: ConflictBlock;
  index: number;
  onResolve: (blockIndex: number, choice: 'ours' | 'theirs' | 'both') => void;
}

function ConflictCard({ block, index, onResolve }: ConflictCardProps): React.ReactElement {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '4px',
        margin: '4px 8px',
        overflow: 'hidden',
        fontSize: '0.8125rem',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Ours section */}
      <div
        style={{
          padding: '4px 8px',
          background: 'rgba(255,100,100,0.15)',
          color: 'var(--git-deleted, #f85149)',
          fontSize: '0.6875rem',
          fontWeight: 600,
          borderBottom: '1px solid rgba(255,100,100,0.2)',
        }}
      >
        {'\u25C0'} OURS{block.oursLabel ? ` (${block.oursLabel})` : ''}
      </div>
      <div
        style={{
          padding: '4px 8px',
          background: 'rgba(255,100,100,0.06)',
          whiteSpace: 'pre',
          overflowX: 'auto',
          minHeight: '1.6em',
          color: 'var(--text)',
        }}
      >
        {block.oursLines.length === 0 ? (
          <span style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '0.75rem' }}>
            (empty)
          </span>
        ) : (
          block.oursLines.map((line, li) => (
            <div key={li} style={{ minHeight: '1.6em', lineHeight: '1.6' }}>
              {line}
            </div>
          ))
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: 'var(--border)',
        }}
      />

      {/* Theirs section */}
      <div
        style={{
          padding: '4px 8px',
          background: 'rgba(100,200,100,0.15)',
          color: 'var(--git-added, #3fb950)',
          fontSize: '0.6875rem',
          fontWeight: 600,
          borderBottom: '1px solid rgba(100,200,100,0.2)',
        }}
      >
        {'\u25B6'} THEIRS{block.theirsLabel ? ` (${block.theirsLabel})` : ''}
      </div>
      <div
        style={{
          padding: '4px 8px',
          background: 'rgba(100,200,100,0.06)',
          whiteSpace: 'pre',
          overflowX: 'auto',
          minHeight: '1.6em',
          color: 'var(--text)',
        }}
      >
        {block.theirsLines.length === 0 ? (
          <span style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '0.75rem' }}>
            (empty)
          </span>
        ) : (
          block.theirsLines.map((line, li) => (
            <div key={li} style={{ minHeight: '1.6em', lineHeight: '1.6' }}>
              {line}
            </div>
          ))
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '6px 8px',
          background: 'var(--bg-tertiary, var(--bg-secondary))',
          borderTop: '1px solid var(--border)',
        }}
      >
        <ActionButton
          label="Accept Ours"
          color="var(--git-deleted, #f85149)"
          onClick={() => onResolve(index, 'ours')}
        />
        <ActionButton
          label="Accept Both"
          color="var(--accent)"
          onClick={() => onResolve(index, 'both')}
        />
        <ActionButton
          label="Accept Theirs"
          color="var(--git-added, #3fb950)"
          onClick={() => onResolve(index, 'theirs')}
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  color: string;
  onClick: () => void;
}

function ActionButton({ label, color, onClick }: ActionButtonProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${color}`,
        borderRadius: '4px',
        background: hovered ? color : 'transparent',
        color: hovered ? 'var(--bg)' : color,
        cursor: 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}

// ─── Main ConflictResolver ────────────────────────────────────────────────────

export function ConflictResolver({
  content,
  filePath,
  onResolved,
}: ConflictResolverProps): React.ReactElement {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const lines = useMemo(() => content.split('\n'), [content]);
  const blocks = useMemo(() => parseConflictBlocks(lines), [lines]);

  const handleResolve = useCallback(
    async (blockIndex: number, choice: 'ours' | 'theirs' | 'both') => {
      if (!filePath) return;

      // Find the block in the current lines (blocks may shift after prior resolutions)
      // Re-parse from scratch since content is the source of truth
      const currentLines = content.split('\n');
      const currentBlocks = parseConflictBlocks(currentLines);
      const block = currentBlocks[blockIndex];
      if (!block) return;

      const newLines = resolveBlock(currentLines, block, choice);
      const newContent = newLines.join('\n');

      setIsSaving(true);
      setSaveError(null);

      try {
        const result = await window.electronAPI.files.createFile(filePath, newContent);
        if (!result.success) {
          setSaveError(result.error ?? 'Failed to save file');
        } else {
          onResolved(newContent);
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSaving(false);
      }
    },
    [content, filePath, onResolved]
  );

  const conflictCount = blocks.length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
      }}
    >
      {/* Status banner */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor:
            conflictCount === 0
              ? 'rgba(63,185,80,0.12)'
              : 'rgba(255,100,100,0.12)',
          borderBottom: `1px solid ${
            conflictCount === 0
              ? 'rgba(63,185,80,0.3)'
              : 'rgba(255,100,100,0.3)'
          }`,
          fontSize: '0.8125rem',
          color:
            conflictCount === 0
              ? 'var(--git-added, #3fb950)'
              : 'var(--git-deleted, #f85149)',
        }}
      >
        {conflictCount === 0 ? (
          <span>All conflicts resolved.</span>
        ) : (
          <span>
            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} remaining
          </span>
        )}
        {isSaving && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Saving…
          </span>
        )}
        {saveError && (
          <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>
            {saveError}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {lines.map((line, lineIdx) => {
          // Check if this line is the start of a conflict block
          const blockIdx = blocks.findIndex((b) => b.startLine === lineIdx);
          if (blockIdx !== -1) {
            const block = blocks[blockIdx];
            return (
              <ConflictCard
                key={`conflict-${lineIdx}`}
                block={block}
                index={blockIdx}
                onResolve={handleResolve}
              />
            );
          }

          // Skip lines that are part of a conflict block (but not the start)
          const insideBlock = blocks.some(
            (b) => lineIdx > b.startLine && lineIdx <= b.endLine
          );
          if (insideBlock) return null;

          // Render normal line
          return (
            <div
              key={`line-${lineIdx}`}
              style={{
                padding: '0 16px 0 12px',
                lineHeight: '1.6',
                minHeight: '1.6em',
                whiteSpace: 'pre',
                color: 'var(--text)',
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
