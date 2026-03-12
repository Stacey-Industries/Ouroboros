/**
 * InlineEditor.tsx — CodeMirror 6 wrapper for inline file editing.
 *
 * Replaces the read-only FileViewer when the user toggles edit mode.
 * Auto-detects language from file extension, themes via CSS custom properties,
 * and tracks dirty state (content differs from initial).
 */

import React, { useRef, useEffect, useCallback, memo } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

// Language imports
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { wast } from '@codemirror/lang-wast';
import { yaml } from '@codemirror/lang-yaml';

// ─── Language detection ───────────────────────────────────────────────────────

function getLanguageExtension(filePath: string) {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return javascript({ jsx: ext === 'tsx', typescript: true });
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return javascript({ jsx: ext === 'jsx' });
    case 'html':
    case 'htm':
    case 'svelte':
    case 'vue':
      return html();
    case 'css':
    case 'scss':
    case 'less':
    case 'sass':
      return css();
    case 'json':
    case 'jsonc':
      return json();
    case 'md':
    case 'mdx':
    case 'markdown':
      return markdown();
    case 'py':
      return python();
    case 'rs':
      return rust();
    case 'c':
    case 'h':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'cs':
      return cpp();
    case 'java':
    case 'kt':
      return java();
    case 'xml':
    case 'svg':
      return xml();
    case 'sql':
      return sql();
    case 'wast':
    case 'wat':
      return wast();
    case 'yaml':
    case 'yml':
      return yaml();
    default:
      return null;
  }
}

// ─── Theme that reads CSS custom properties ──────────────────────────────────

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.8125rem',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '8px 0',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--accent)',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(88, 166, 255, 0.2)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(88, 166, 255, 0.15)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(88, 166, 255, 0.06)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary, var(--bg))',
    color: 'var(--text-faint)',
    borderRight: '1px solid var(--border-muted, var(--border))',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(88, 166, 255, 0.08)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    padding: '0 4px',
    borderRadius: '3px',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(229, 192, 123, 0.3)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(229, 192, 123, 0.5)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-secondary, var(--bg))',
    color: 'var(--text)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--border)',
  },
  '.cm-panel.cm-search': {
    padding: '4px 8px',
  },
  '.cm-panel.cm-search input': {
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-panel.cm-search button': {
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  '.cm-panel.cm-search button:hover': {
    backgroundColor: 'var(--border)',
    color: 'var(--text)',
  },
  '.cm-panel.cm-search label': {
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgba(88, 166, 255, 0.15)',
    },
  },
});

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InlineEditorProps {
  content: string;
  filePath: string;
  onSave: (content: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InlineEditor = memo(function InlineEditor({
  content,
  filePath,
  onSave,
  onDirtyChange,
}: InlineEditorProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const initialContentRef = useRef(content);
  // Keep callbacks in refs so the editor doesn't need to be recreated
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // Track dirty state locally to avoid re-firing on every keystroke
  const isDirtyRef = useRef(false);

  // Create the editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(filePath);

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          onSaveRef.current(view.state.doc.toString());
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const currentContent = update.state.doc.toString();
        const dirty = currentContent !== initialContentRef.current;
        if (dirty !== isDirtyRef.current) {
          isDirtyRef.current = dirty;
          onDirtyChangeRef.current(dirty);
        }
      }
    });

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      saveKeymap,
      updateListener,
      languageCompartment.current.of(langExt ? [langExt] : []),
      editorTheme,
      // Set the editor background to transparent so CSS vars work
      EditorView.theme({
        '&': {
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
        },
      }),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create editor once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When filePath changes, update language and replace document
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    initialContentRef.current = content;
    isDirtyRef.current = false;
    onDirtyChangeRef.current(false);

    const langExt = getLanguageExtension(filePath);

    // Replace document content
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: content,
      },
    });

    // Update language
    view.dispatch({
      effects: languageCompartment.current.reconfigure(langExt ? [langExt] : []),
    });
  }, [filePath, content]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  );
});

export type { InlineEditorProps as InlineEditorProps };
