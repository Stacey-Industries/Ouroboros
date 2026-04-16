/**
 * FileRefBadge.tsx — Clickable wrapper for file reference tokens in chat text.
 *
 * Dispatches `agent-ide:open-file` on click so the existing FileViewerManager
 * listener handles resolution and navigation. Hover shows CitationHoverCard.
 */
import React, { useCallback, useRef, useState } from 'react';

import type { FileRef } from '../../../shared/FileRefResolver';
import { OPEN_FILE_EVENT } from '../../hooks/appEventNames';
import { CitationHoverCard } from './CitationHoverCard';

// ── helpers ───────────────────────────────────────────────────────────────────

export function resolveRefPath(fileRef: FileRef, projectRoot?: string): string {
  const { path } = fileRef;
  if (projectRoot && !path.startsWith('/') && !path.match(/^[A-Za-z]:\\/)) {
    return `${projectRoot}/${path}`.replace(/\\/g, '/');
  }
  return path;
}

function buildAriaLabel(fileRef: FileRef): string {
  const suffix = fileRef.line != null ? `:${fileRef.line}` : '';
  return `Open file ${fileRef.path}${suffix}`;
}

function dispatchOpenFile(filePath: string, line?: number, col?: number): void {
  window.dispatchEvent(new CustomEvent(OPEN_FILE_EVENT, { detail: { filePath, line, col } }));
}

// ── hover-delay hook ──────────────────────────────────────────────────────────

const HOVER_DELAY_MS = 200;

function useHoverDelay(): { show: boolean; onEnter: () => void; onLeave: () => void } {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEnter = useCallback(() => {
    timer.current = setTimeout(() => setShow(true), HOVER_DELAY_MS);
  }, []);
  const onLeave = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    setShow(false);
  }, []);
  return { show, onEnter, onLeave };
}

// ── component ─────────────────────────────────────────────────────────────────

export interface FileRefBadgeProps {
  fileRef: FileRef;
  projectRoot?: string;
  children: React.ReactNode;
}

export function FileRefBadge({ fileRef, projectRoot, children }: FileRefBadgeProps): React.ReactElement {
  const { show: showCard, onEnter, onLeave } = useHoverDelay();
  const badgeRef = useRef<HTMLButtonElement>(null);
  const resolvedPath = resolveRefPath(fileRef, projectRoot);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatchOpenFile(resolvedPath, fileRef.line, fileRef.col);
  }, [resolvedPath, fileRef.line, fileRef.col]);

  return (
    <span className="relative inline-block">
      <button
        ref={badgeRef} type="button" aria-label={buildAriaLabel(fileRef)}
        className="cursor-pointer underline text-interactive-accent hover:text-interactive-hover bg-transparent border-0 p-0 font-inherit text-inherit"
        style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
        onClick={handleClick} onMouseEnter={onEnter} onMouseLeave={onLeave}
      >{children}</button>
      {showCard && (
        <CitationHoverCard fileRef={fileRef} projectRoot={projectRoot} anchorRef={badgeRef} onClose={onLeave} />
      )}
    </span>
  );
}
