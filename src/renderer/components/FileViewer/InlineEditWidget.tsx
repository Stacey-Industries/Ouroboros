/**
 * InlineEditWidget — floating Monaco IContentWidget for Ctrl+K inline edits.
 *
 * Renders at the selection anchor. Phases: input → loading → preview.
 * Preview applies diff decorations to the editor and shows Accept/Reject actions.
 */
import * as monaco from 'monaco-editor';
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { InlineEditActions, InlineEditState } from './useInlineEdit';

// ─── Diff decoration class names (CSS defined in globals.css) ────────────────

const CLS_DEL_BG = 'ouroboros-inline-edit-del';
const CLS_DEL_GUTTER = 'ouroboros-inline-edit-del-gutter';

// ─── Decoration helpers ───────────────────────────────────────────────────────

function buildPreviewDecorations(
  range: { startLine: number; endLine: number },
): monaco.editor.IModelDeltaDecoration[] {
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  for (let ln = range.startLine; ln <= range.endLine; ln++) {
    decorations.push({
      range: new monaco.Range(ln, 1, ln, 1),
      options: {
        isWholeLine: true,
        className: CLS_DEL_BG,
        glyphMarginClassName: CLS_DEL_GUTTER,
      },
    });
  }
  return decorations;
}

// ─── Input phase UI ───────────────────────────────────────────────────────────

interface InputPhaseProps {
  error: string | null;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

function InputPhase({ error, onSubmit, onCancel }: InputPhaseProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = inputRef.current?.value.trim() ?? '';
      if (val) onSubmit(val);
    }
  }, [onCancel, onSubmit]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded border border-border-semantic bg-surface-inset px-2 py-1.5 text-sm text-text-semantic-primary placeholder:text-text-semantic-faint focus:outline-none focus:border-border-semantic-accent selectable"
        placeholder="Describe the change..."
        onKeyDown={handleKeyDown}
      />
      {error && (
        <p className="text-xs text-status-error">{error}</p>
      )}
    </div>
  );
}

// ─── Loading phase UI ────────────────────────────────────────────────────────

function LoadingPhase(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className="inline-block h-3 w-3 rounded-full bg-interactive-accent animate-pulse-soft"
        aria-hidden="true"
      />
      <span className="text-sm text-text-semantic-muted">Generating edit...</span>
    </div>
  );
}

// ─── Preview action bar ───────────────────────────────────────────────────────

interface PreviewActionsProps {
  onAccept: () => void;
  onReject: () => void;
  isStreaming?: boolean;
}

function PreviewActions({ onAccept, onReject, isStreaming }: PreviewActionsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 pt-1">
      {isStreaming && (
        <span
          className="inline-block h-2 w-2 rounded-full bg-interactive-accent animate-pulse-soft"
          aria-hidden="true"
          title="Streaming..."
        />
      )}
      <button
        type="button"
        className="btn-primary text-xs px-2 py-1 disabled:opacity-50"
        onClick={onAccept}
        disabled={isStreaming}
        title={isStreaming ? 'Waiting for stream to complete...' : 'Accept edit (Enter)'}
      >
        ✓ Accept
      </button>
      <button
        type="button"
        className="btn-ghost text-xs px-2 py-1"
        onClick={onReject}
        title="Reject edit (Escape)"
      >
        ✕ Reject
      </button>
    </div>
  );
}

// ─── Widget DOM node manager ──────────────────────────────────────────────────

function useWidgetNode(): React.RefObject<HTMLDivElement> {
  const nodeRef = useRef<HTMLDivElement>(document.createElement('div'));
  useEffect(() => {
    nodeRef.current.className =
      'rounded-md border border-border-semantic bg-surface-overlay px-3 py-2 shadow-lg min-w-[280px] max-w-[480px]';
    nodeRef.current.style.cssText =
      'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 50;';
  }, []);
  return nodeRef as React.RefObject<HTMLDivElement>;
}

// ─── IContentWidget lifecycle ─────────────────────────────────────────────────

function useContentWidget(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  nodeRef: React.RefObject<HTMLDivElement>,
  selectionRange: { startLine: number; endLine: number } | null,
  active: boolean,
): void {
  const widgetRef = useRef<monaco.editor.IContentWidget | null>(null);

  useEffect(() => {
    if (!editor || !active || !selectionRange) return;
    const widget: monaco.editor.IContentWidget = {
      getId: () => 'ouroboros.inline-edit-widget',
      getDomNode: () => nodeRef.current!,
      getPosition: () => ({
        position: { lineNumber: selectionRange.startLine, column: 1 },
        preference: [
          monaco.editor.ContentWidgetPositionPreference.BELOW,
          monaco.editor.ContentWidgetPositionPreference.ABOVE,
        ],
      }),
    };
    editor.addContentWidget(widget);
    widgetRef.current = widget;
    return () => {
      editor.removeContentWidget(widget);
      widgetRef.current = null;
    };
  }, [editor, nodeRef, active, selectionRange]);
}

// ─── Preview diff decorations ─────────────────────────────────────────────────

function usePreviewDecorations(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  state: InlineEditState,
): void {
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editor) return;
    if (state.phase === 'preview' && state.selectionRange) {
      const newDecorations = buildPreviewDecorations(state.selectionRange);
      idsRef.current = editor.deltaDecorations(idsRef.current, newDecorations);
    } else {
      idsRef.current = editor.deltaDecorations(idsRef.current, []);
    }
    return () => {
      idsRef.current = editor.deltaDecorations(idsRef.current, []);
    };
  }, [editor, state.phase, state.selectionRange]);
}

// ─── Preview keyboard handler ─────────────────────────────────────────────────

function usePreviewKeyboard(
  phase: string,
  onAccept: () => void,
  onReject: () => void,
): void {
  useEffect(() => {
    if (phase !== 'preview') return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') { e.preventDefault(); onAccept(); }
      if (e.key === 'Escape') { e.preventDefault(); onReject(); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [phase, onAccept, onReject]);
}

// ─── Main widget component ────────────────────────────────────────────────────

export interface InlineEditWidgetProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  state: InlineEditState;
  actions: Pick<InlineEditActions, 'submit' | 'accept' | 'reject' | 'cancel' | 'streaming'>;
}

export function InlineEditWidget({ editor, state, actions }: InlineEditWidgetProps): React.ReactElement | null {
  const nodeRef = useWidgetNode();
  const isActive = state.phase !== 'idle';

  useContentWidget(editor, nodeRef, state.selectionRange, isActive);
  usePreviewDecorations(editor, state);
  usePreviewKeyboard(state.phase, actions.accept, actions.reject);

  if (!isActive) return null;

  return (
    <WidgetPortal nodeRef={nodeRef} state={state} actions={actions} />
  );
}

// ─── Portal renderer (renders into the Monaco widget DOM node) ────────────────

interface WidgetPortalProps {
  nodeRef: React.RefObject<HTMLDivElement>;
  state: InlineEditState;
  actions: Pick<InlineEditActions, 'submit' | 'accept' | 'reject' | 'cancel' | 'streaming'>;
}

function WidgetPortal({ nodeRef, state, actions }: WidgetPortalProps): React.ReactElement | null {
  const node = nodeRef.current;
  if (!node) return null;
  return createPortal(
    <WidgetContent state={state} actions={actions} />,
    node,
  );
}

// ─── Widget content switcher ──────────────────────────────────────────────────

interface WidgetContentProps {
  state: InlineEditState;
  actions: Pick<InlineEditActions, 'submit' | 'accept' | 'reject' | 'cancel' | 'streaming'>;
}

function WidgetContent({ state, actions }: WidgetContentProps): React.ReactElement {
  const isStreaming = actions.streaming?.isStreaming ?? false;
  if (state.phase === 'loading' && !isStreaming) return <LoadingPhase />;
  if (state.phase === 'preview' || (state.phase === 'loading' && isStreaming)) {
    return (
      <PreviewActions
        onAccept={actions.accept}
        onReject={actions.reject}
        isStreaming={isStreaming}
      />
    );
  }
  return (
    <InputPhase
      error={state.error}
      onSubmit={actions.submit}
      onCancel={actions.cancel}
    />
  );
}
