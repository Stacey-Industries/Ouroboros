/**
 * ChangeSummaryBarParts.tsx — Sub-components for ChangeSummaryBar.
 * Extracted to keep ChangeSummaryBar.tsx under the 300-line limit.
 */
import React, { useEffect, useState } from 'react';

import type { ChangeTally } from './ChangeSummaryBar';

/* ---------- DiffLine type + parser ---------- */

interface DiffLine {
  prefix: string;
  content: string;
  type: 'add' | 'remove' | 'context' | 'header';
}

function parsePatchLines(patch: string): DiffLine[] {
  return patch
    .split('\n')
    .map((raw) =>
      raw.startsWith('@@')
        ? { prefix: '', content: raw, type: 'header' }
        : raw.startsWith('+')
          ? { prefix: '+', content: raw.slice(1), type: 'add' }
          : raw.startsWith('-')
            ? { prefix: '-', content: raw.slice(1), type: 'remove' }
            : { prefix: ' ', content: raw.startsWith(' ') ? raw.slice(1) : raw, type: 'context' },
    );
}

const diffLineColors: Record<DiffLine['type'], React.CSSProperties> = {
  add: { backgroundColor: 'rgba(63, 185, 80, 0.1)', color: 'var(--status-success)' },
  remove: { backgroundColor: 'rgba(248, 81, 73, 0.1)', color: 'var(--status-error)' },
  context: {},
  header: { fontWeight: 600 },
};

/* ---------- Icons ---------- */

export function FileIcon(): React.ReactElement {
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

export function DiffIcon(): React.ReactElement {
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
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/* ---------- InlineDiffViewer ---------- */

function useDiffPatch(projectRoot: string, filePath: string) {
  const [patch, setPatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await window.electronAPI.git.diffRaw(projectRoot, filePath);
        if (active) setPatch(result.patch ?? '');
      } catch {
        if (active) setPatch('');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filePath, projectRoot]);
  return { patch, loading };
}

function DiffLineRow({ line }: { line: DiffLine }): React.ReactElement {
  return (
    <div
      className={`px-3 py-0 ${line.type === 'context' ? 'text-text-semantic-muted' : line.type === 'header' ? 'text-interactive-accent' : ''}`}
      style={diffLineColors[line.type]}
    >
      <span className="inline-block w-3 select-none opacity-40">{line.prefix}</span>
      {line.content}
    </div>
  );
}

export function InlineDiffViewer({
  filePath,
  projectRoot,
}: {
  filePath: string;
  projectRoot: string;
}): React.ReactElement {
  const { patch, loading } = useDiffPatch(projectRoot, filePath);
  if (loading)
    return (
      <div className="px-3 py-2 text-[10px] italic text-text-semantic-faint">Loading diff...</div>
    );
  if (!patch)
    return (
      <div className="px-3 py-2 text-[10px] italic text-text-semantic-faint">
        No changes (file matches HEAD)
      </div>
    );
  const lines = parsePatchLines(patch);
  return (
    <div
      className="overflow-auto text-[11px] leading-[1.5]"
      style={{
        maxHeight: '300px',
        fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      {lines.map((line, i) => (
        <DiffLineRow key={i} line={line} />
      ))}
    </div>
  );
}

/* ---------- FileChangeRow ---------- */

function shortenPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.length <= 3 ? parts.join('/') : `.../${parts.slice(-3).join('/')}`;
}

export function FileChangeRow({
  filePath,
  isSelected,
  onClick,
}: {
  filePath: string;
  isSelected: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 border-none px-3 py-1 text-left text-[11px] transition-colors ${isSelected ? 'text-text-semantic-primary' : 'text-text-semantic-muted'}`}
      style={{
        backgroundColor: isSelected
          ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)'
          : 'transparent',
        borderBottom: '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
      }}
    >
      <FileIcon />
      <span className="truncate">{shortenPath(filePath)}</span>
      <svg
        className={`ml-auto h-3 w-3 shrink-0 transition-transform duration-150 ${isSelected ? 'rotate-90' : ''}`}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.5 }}
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  );
}

/* ---------- CompletedChangeHeader ---------- */

function TallyLines({ tally }: { tally: ChangeTally }): React.ReactElement | null {
  const hasTallyLines = tally.linesAdded > 0 || tally.linesRemoved > 0;
  if (!hasTallyLines) return null;
  return (
    <span className="flex items-center gap-1.5">
      {tally.linesAdded > 0 && <span className="text-status-success">+{tally.linesAdded}</span>}
      {tally.linesRemoved > 0 && <span className="text-status-error">-{tally.linesRemoved}</span>}
    </span>
  );
}

type CompletedChangeHeaderProps = {
  fileCount: number;
  expanded: boolean;
  tally?: ChangeTally;
  onToggleExpanded: () => void;
  onOpenFullReview: () => void;
};

export function CompletedChangeHeader(p: CompletedChangeHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-border-semantic px-3 py-1.5 text-[11px] text-text-semantic-muted">
      {p.fileCount > 0 && (
        <button
          onClick={p.onToggleExpanded}
          className="flex shrink-0 items-center gap-1 border-none bg-none p-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ChevronIcon expanded={p.expanded} />
        </button>
      )}
      <DiffIcon />
      <span>
        {p.fileCount > 0 ? `${p.fileCount} file${p.fileCount !== 1 ? 's' : ''} changed` : 'Changes'}
      </span>
      {p.tally && <TallyLines tally={p.tally} />}
      <button
        onClick={p.onOpenFullReview}
        className="ml-auto shrink-0 border-none bg-none p-0 text-[10px] font-medium text-interactive-accent"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Full Review →
      </button>
    </div>
  );
}

/* ---------- CompletedChangeFileList ---------- */

export function CompletedChangeFileList({
  expanded,
  tally,
  projectRoot,
  selectedFile,
  onSelectFile,
}: {
  expanded: boolean;
  tally?: ChangeTally;
  projectRoot: string;
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
}): React.ReactElement | null {
  if (!expanded || !tally || tally.filesChanged.length === 0) return null;
  return (
    <div className="border-t border-border-semantic">
      {tally.filesChanged.map((file) => (
        <React.Fragment key={file}>
          <FileChangeRow
            filePath={file}
            isSelected={selectedFile === file}
            onClick={() => onSelectFile(file)}
          />
          {selectedFile === file && <InlineDiffViewer filePath={file} projectRoot={projectRoot} />}
        </React.Fragment>
      ))}
    </div>
  );
}
