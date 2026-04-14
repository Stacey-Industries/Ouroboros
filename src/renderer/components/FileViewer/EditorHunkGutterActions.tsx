/**
 * EditorHunkGutterActions — Monaco IContentWidget that renders ✓/✗ action
 * buttons pinned to the top of each pending hunk in the editor.
 *
 * One widget instance is created per hunk decoration. The widget is removed
 * when the hunk is resolved or the review is closed.
 */
import '../../styles/editor-hunk.css';

import * as monaco from 'monaco-editor';
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { DiffReviewContextValue } from '../DiffReview/DiffReviewManager';
import type { HunkDecoration } from './useEditorHunkDecorations';

// ─── Single-hunk action button strip ─────────────────────────────────────────

interface HunkActionButtonsProps {
  onAccept: () => void;
  onReject: () => void;
}

function HunkActionButtons({
  onAccept,
  onReject,
}: HunkActionButtonsProps): React.ReactElement {
  return (
    <div className="ouroboros-hunk-actions-widget" aria-label="Hunk actions">
      <button
        type="button"
        className="ouroboros-hunk-btn ouroboros-hunk-btn-accept"
        onClick={onAccept}
        title="Accept hunk (Alt+Y)"
        aria-label="Accept hunk"
      >
        ✓
      </button>
      <button
        type="button"
        className="ouroboros-hunk-btn ouroboros-hunk-btn-reject"
        onClick={onReject}
        title="Reject hunk (Alt+N)"
        aria-label="Reject hunk"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Single content widget ────────────────────────────────────────────────────

interface HunkWidgetProps {
  editor: monaco.editor.IStandaloneCodeEditor;
  dec: HunkDecoration;
  diffReview: DiffReviewContextValue;
}

function HunkWidget({ editor, dec, diffReview }: HunkWidgetProps): React.ReactElement | null {
  const nodeRef = useRef<HTMLDivElement>(document.createElement('div'));
  const widgetRef = useRef<monaco.editor.IContentWidget | null>(null);

  const onAccept = useCallback((): void => {
    diffReview.acceptHunk(dec.fileIdx, dec.hunkIdx);
  }, [diffReview, dec.fileIdx, dec.hunkIdx]);

  const onReject = useCallback((): void => {
    diffReview.rejectHunk(dec.fileIdx, dec.hunkIdx);
  }, [diffReview, dec.fileIdx, dec.hunkIdx]);

  useEffect(() => {
    const node = nodeRef.current;
    node.style.cssText = 'pointer-events:auto; z-index:10;';
    const widget: monaco.editor.IContentWidget = {
      getId: () => `ouroboros.hunk-actions.${dec.hunk.id}`,
      getDomNode: () => node,
      getPosition: () => ({
        position: { lineNumber: dec.anchorLine, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      }),
    };
    editor.addContentWidget(widget);
    widgetRef.current = widget;
    return () => {
      editor.removeContentWidget(widget);
      widgetRef.current = null;
    };
  }, [editor, dec.hunk.id, dec.anchorLine]);

  return createPortal(
    <HunkActionButtons onAccept={onAccept} onReject={onReject} />,
    nodeRef.current,
  );
}

// ─── Multi-hunk widget host ───────────────────────────────────────────────────

export interface EditorHunkGutterActionsProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  decorations: HunkDecoration[];
  diffReview: DiffReviewContextValue | null;
}

export function EditorHunkGutterActions({
  editor,
  decorations,
  diffReview,
}: EditorHunkGutterActionsProps): React.ReactElement | null {
  if (!editor || !diffReview || decorations.length === 0) return null;

  return (
    <>
      {decorations.map((dec) => (
        <HunkWidget
          key={dec.hunk.id}
          editor={editor}
          dec={dec}
          diffReview={diffReview}
        />
      ))}
    </>
  );
}
