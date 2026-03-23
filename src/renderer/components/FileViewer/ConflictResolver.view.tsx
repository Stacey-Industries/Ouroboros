import React, { useCallback, useMemo, useState } from 'react';

import type {
  ConflictBlock,
  ConflictChoice,
  ConflictResolverProps,
} from './ConflictResolver.model';
import { parseConflictBlocks, resolveConflictBlock } from './ConflictResolver.model';

interface ConflictRenderLine {
  type: 'line';
  line: string;
  lineIdx: number;
}

interface ConflictRenderBlock {
  type: 'block';
  block: ConflictBlock;
  blockIndex: number;
  lineIdx: number;
}

type ConflictRenderItem = ConflictRenderLine | ConflictRenderBlock;

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
};

const scrollBodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
};

const lineStyle: React.CSSProperties = {
  padding: '0 16px 0 12px',
  lineHeight: '1.6',
  minHeight: '1.6em',
  whiteSpace: 'pre',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  margin: '4px 8px',
  overflow: 'hidden',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '6px 8px',
  background: 'var(--surface-raised)',
  borderTop: '1px solid var(--border-semantic)',
};

function resolveBlockContent(
  content: string,
  blockIndex: number,
  choice: ConflictChoice,
): string | null {
  const currentLines = content.split('\n');
  const currentBlocks = parseConflictBlocks(currentLines);
  const block = currentBlocks[blockIndex];
  if (!block) {
    return null;
  }
  return resolveConflictBlock(currentLines, block, choice).join('\n');
}

async function saveResolvedContent(filePath: string, newContent: string): Promise<string | null> {
  const result = await window.electronAPI.files.createFile(filePath, newContent);
  if (result.success) {
    return null;
  }
  return result.error ?? 'Failed to save file';
}

function useConflictActions(
  content: string,
  filePath: string,
  onResolved: (newContent: string) => void,
): {
  isSaving: boolean;
  saveError: string | null;
  handleResolve: (blockIndex: number, choice: ConflictChoice) => Promise<void>;
} {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handleResolve = useCallback(
    async (blockIndex: number, choice: ConflictChoice) => {
      if (!filePath) {
        return;
      }
      const newContent = resolveBlockContent(content, blockIndex, choice);
      if (newContent == null) {
        return;
      }
      setIsSaving(true);
      setSaveError(null);
      try {
        const error = await saveResolvedContent(filePath, newContent);
        if (error) {
          setSaveError(error);
          return;
        }
        onResolved(newContent);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSaving(false);
      }
    },
    [content, filePath, onResolved],
  );
  return { isSaving, saveError, handleResolve };
}

function buildRenderItems(lines: string[], blocks: ConflictBlock[]): ConflictRenderItem[] {
  const items: ConflictRenderItem[] = [];
  let lineIdx = 0;
  let blockIndex = 0;
  while (lineIdx < lines.length) {
    const block = blocks[blockIndex];
    if (block && block.startLine === lineIdx) {
      items.push({ type: 'block', block, blockIndex, lineIdx });
      lineIdx = block.endLine + 1;
      blockIndex += 1;
      continue;
    }
    items.push({ type: 'line', line: lines[lineIdx], lineIdx });
    lineIdx += 1;
  }
  return items;
}

function getSectionHeaderStyle(
  background: string,
  color: string,
  borderColor: string,
): React.CSSProperties {
  return {
    padding: '4px 8px',
    background,
    color,
    fontSize: '0.6875rem',
    fontWeight: 600,
    borderBottom: `1px solid ${borderColor}`,
  };
}

function getSectionBodyStyle(background: string): React.CSSProperties {
  return {
    padding: '4px 8px',
    background,
    whiteSpace: 'pre',
    overflowX: 'auto',
    minHeight: '1.6em',
  };
}

function ActionButton(props: {
  label: string;
  color: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${props.color}`,
        borderRadius: '4px',
        background: hovered ? props.color : 'transparent',
        color: hovered ? 'var(--text-on-accent)' : props.color,
        cursor: 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {props.label}
    </button>
  );
}

function ConflictSection(props: {
  title: string;
  label: string;
  color: string;
  headerBackground: string;
  headerBorder: string;
  bodyBackground: string;
  lines: string[];
}): React.ReactElement {
  return (
    <>
      <div style={getSectionHeaderStyle(props.headerBackground, props.color, props.headerBorder)}>
        {props.title}
        {props.label ? ` (${props.label})` : ''}
      </div>
      <div className="text-text-semantic-primary" style={getSectionBodyStyle(props.bodyBackground)}>
        {props.lines.length === 0 ? (
          <span
            className="text-text-semantic-faint"
            style={{ fontStyle: 'italic', fontSize: '0.75rem' }}
          >
            (empty)
          </span>
        ) : (
          props.lines.map((line, index) => (
            <div key={index} style={{ minHeight: '1.6em', lineHeight: '1.6' }}>
              {line}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ConflictActions(props: {
  blockIndex: number;
  onResolve: (blockIndex: number, choice: ConflictChoice) => void;
}): React.ReactElement {
  return (
    <div style={actionsStyle}>
      <ActionButton
        label="Accept Ours"
        color="var(--git-deleted, var(--status-error))"
        onClick={() => props.onResolve(props.blockIndex, 'ours')}
      />
      <ActionButton
        label="Accept Both"
        color="var(--interactive-accent)"
        onClick={() => props.onResolve(props.blockIndex, 'both')}
      />
      <ActionButton
        label="Accept Theirs"
        color="var(--git-added, var(--status-success))"
        onClick={() => props.onResolve(props.blockIndex, 'theirs')}
      />
    </div>
  );
}

function ConflictCard(props: {
  block: ConflictBlock;
  blockIndex: number;
  onResolve: (blockIndex: number, choice: ConflictChoice) => void;
}): React.ReactElement {
  return (
    <div style={cardStyle}>
      <ConflictSection
        title="Ours"
        label={props.block.oursLabel}
        color="var(--git-deleted, var(--status-error))"
        headerBackground="rgba(255,100,100,0.15)"
        headerBorder="rgba(255,100,100,0.2)"
        bodyBackground="rgba(255,100,100,0.06)"
        lines={props.block.oursLines}
      />
      <div style={{ height: '1px', background: 'var(--border-semantic)' }} />
      <ConflictSection
        title="Theirs"
        label={props.block.theirsLabel}
        color="var(--git-added, var(--status-success))"
        headerBackground="rgba(100,200,100,0.15)"
        headerBorder="rgba(100,200,100,0.2)"
        bodyBackground="rgba(100,200,100,0.06)"
        lines={props.block.theirsLines}
      />
      <ConflictActions blockIndex={props.blockIndex} onResolve={props.onResolve} />
    </div>
  );
}

function ConflictStatus(props: {
  conflictCount: number;
  isSaving: boolean;
  saveError: string | null;
}): React.ReactElement {
  const hasConflicts = props.conflictCount > 0;
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        backgroundColor: hasConflicts ? 'rgba(255,100,100,0.12)' : 'rgba(63,185,80,0.12)',
        borderBottom: `1px solid ${hasConflicts ? 'rgba(255,100,100,0.3)' : 'rgba(63,185,80,0.3)'}`,
        fontSize: '0.8125rem',
        color: hasConflicts
          ? 'var(--git-deleted, var(--status-error))'
          : 'var(--git-added, var(--status-success))',
      }}
    >
      <span>
        {hasConflicts
          ? `${props.conflictCount} conflict${props.conflictCount === 1 ? '' : 's'} remaining`
          : 'All conflicts resolved.'}
      </span>
      {props.isSaving ? (
        <span className="text-text-semantic-muted" style={{ fontSize: '0.75rem' }}>
          Saving...
        </span>
      ) : null}
      {props.saveError ? (
        <span className="text-status-error" style={{ fontSize: '0.75rem' }}>
          {props.saveError}
        </span>
      ) : null}
    </div>
  );
}

function NormalLine({ line }: { line: string }): React.ReactElement {
  return (
    <div className="text-text-semantic-primary" style={lineStyle}>
      {line}
    </div>
  );
}

function ConflictContent(props: {
  items: ConflictRenderItem[];
  onResolve: (blockIndex: number, choice: ConflictChoice) => void;
}): React.ReactElement {
  return (
    <div style={scrollBodyStyle}>
      {props.items.map((item) =>
        item.type === 'block' ? (
          <ConflictCard
            key={`conflict-${item.lineIdx}`}
            block={item.block}
            blockIndex={item.blockIndex}
            onResolve={props.onResolve}
          />
        ) : (
          <NormalLine key={`line-${item.lineIdx}`} line={item.line} />
        ),
      )}
    </div>
  );
}

export function ConflictResolver({
  content,
  filePath,
  onResolved,
}: ConflictResolverProps): React.ReactElement {
  const lines = useMemo(() => content.split('\n'), [content]);
  const blocks = useMemo(() => parseConflictBlocks(lines), [lines]);
  const items = useMemo(() => buildRenderItems(lines, blocks), [blocks, lines]);
  const { isSaving, saveError, handleResolve } = useConflictActions(content, filePath, onResolved);
  return (
    <div style={containerStyle}>
      <ConflictStatus conflictCount={blocks.length} isSaving={isSaving} saveError={saveError} />
      <ConflictContent items={items} onResolve={handleResolve} />
    </div>
  );
}
