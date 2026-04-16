/**
 * CitationHoverCard.tsx — Floating snippet preview for file references.
 *
 * Renders near the badge anchor via a portal. Fetches file content via
 * window.electronAPI.files.readFile, shows ±10 lines around fileRef.line,
 * or the first 20 lines when no line is given.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { FileRef } from '../../../shared/FileRefResolver';
import { OPEN_FILE_EVENT } from '../../hooks/appEventNames';

// ── types / constants ─────────────────────────────────────────────────────────

export interface CitationHoverCardProps {
  fileRef: FileRef;
  projectRoot?: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose?: () => void;
}

interface CardPosition { top: number; left: number }

const SNIPPET_CONTEXT = 10;
const SNIPPET_HEAD = 20;
const CARD_WIDTH = 420;

// ── pure helpers ──────────────────────────────────────────────────────────────

export function resolveCardPath(fileRef: FileRef, projectRoot?: string): string {
  const { path } = fileRef;
  if (projectRoot && !path.startsWith('/') && !path.match(/^[A-Za-z]:\\/)) {
    return `${projectRoot}/${path}`.replace(/\\/g, '/');
  }
  return path;
}

function extractSnippet(content: string, line?: number): { lines: string[]; startLine: number } {
  const all = content.split('\n');
  if (line == null || line <= 0) return { lines: all.slice(0, SNIPPET_HEAD), startLine: 1 };
  const idx = line - 1;
  const from = Math.max(0, idx - SNIPPET_CONTEXT);
  const to = Math.min(all.length, idx + SNIPPET_CONTEXT + 1);
  return { lines: all.slice(from, to), startLine: from + 1 };
}

function computePosition(anchor: HTMLElement): CardPosition {
  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= 200 ? rect.bottom + 6 : rect.top - 6;
  const left = Math.min(rect.left, window.innerWidth - CARD_WIDTH - 12);
  return { top: top + window.scrollY, left: Math.max(8, left) };
}

// ── SnippetView ───────────────────────────────────────────────────────────────

function SnippetView({
  snippet, startLine, targetLine,
}: { snippet: string[]; startLine: number; targetLine?: number }): React.ReactElement {
  return (
    <pre className="text-xs font-mono text-text-semantic-primary"
      style={{ margin: 0, padding: '0.5em 0.75em', lineHeight: 1.5 }}
    >
      {snippet.map((line, i) => {
        const lineNum = startLine + i;
        const isTarget = targetLine != null && lineNum === targetLine;
        return (
          <div key={lineNum}
            className={isTarget ? 'bg-interactive-selection' : undefined}
            style={{ display: 'flex', gap: '0.75em' }}
          >
            <span className="text-text-semantic-faint select-none"
              style={{ minWidth: '2.5em', textAlign: 'right' }}
            >{lineNum}</span>
            <span>{line}</span>
          </div>
        );
      })}
    </pre>
  );
}

// ── useFetchSnippet ───────────────────────────────────────────────────────────

interface SnippetState { snippet: string[] | null; startLine: number; error: string | null; loading: boolean }

function useFetchSnippet(resolvedPath: string, targetLine?: number): SnippetState {
  const [snippet, setSnippet] = useState<string[] | null>(null);
  const [startLine, setStartLine] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const api = (window as typeof window & {
      electronAPI?: { files?: { readFile?: (p: string) => Promise<{ success: boolean; content?: string; error?: string }> } };
    }).electronAPI;
    if (!api?.files?.readFile) { setError('File API unavailable'); setLoading(false); return; }
    void api.files.readFile(resolvedPath).then((result) => {
      if (!result.success || result.content == null) {
        setError(result.error ?? 'Could not read file');
      } else {
        const { lines, startLine: sl } = extractSnippet(result.content, targetLine);
        setSnippet(lines);
        setStartLine(sl);
      }
      setLoading(false);
    });
  }, [resolvedPath, targetLine]);

  return { snippet, startLine, error, loading };
}

// ── useDismissHandlers ────────────────────────────────────────────────────────

function useDismissHandlers(
  cardRef: React.RefObject<HTMLDivElement | null>,
  onClose?: () => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose?.(); };
    const onDown = (e: MouseEvent): void => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose, cardRef]);
}

// ── CitationHoverCard ─────────────────────────────────────────────────────────

export function CitationHoverCard({
  fileRef, projectRoot, anchorRef, onClose,
}: CitationHoverCardProps): React.ReactElement {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CardPosition>({ top: 0, left: 0 });
  const resolvedPath = resolveCardPath(fileRef, projectRoot);

  useEffect(() => {
    if (anchorRef.current) setPos(computePosition(anchorRef.current));
  }, [anchorRef]);

  const { snippet, startLine, error, loading } = useFetchSnippet(resolvedPath, fileRef.line);
  useDismissHandlers(cardRef, onClose);

  const handleOpenInEditor = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_FILE_EVENT, {
      detail: { filePath: resolvedPath, line: fileRef.line, col: fileRef.col },
    }));
    onClose?.();
  }, [resolvedPath, fileRef.line, fileRef.col, onClose]);

  const card = (
    <div ref={cardRef} data-testid="citation-hover-card"
      className="fixed z-50 rounded border bg-surface-panel border-border-semantic shadow-lg"
      style={{ top: pos.top, left: pos.left, width: CARD_WIDTH, maxHeight: 300 }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
        <span className="text-xs font-mono text-text-semantic-muted truncate"
          style={{ maxWidth: CARD_WIDTH - 100 }}
        >{fileRef.raw}</span>
        <button type="button" onClick={handleOpenInEditor}
          className="text-xs text-interactive-accent hover:text-interactive-hover ml-2 shrink-0"
        >Open in editor</button>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 240 }}>
        {loading && <p className="px-3 py-2 text-xs text-text-semantic-muted">Loading…</p>}
        {!loading && error && <p className="px-3 py-2 text-xs text-status-error">{error}</p>}
        {!loading && snippet && <SnippetView snippet={snippet} startLine={startLine} targetLine={fileRef.line} />}
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
