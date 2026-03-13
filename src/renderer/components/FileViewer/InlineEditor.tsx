/**
 * InlineEditor.tsx — CodeMirror 6 wrapper for inline file editing.
 *
 * Replaces the read-only FileViewer when the user toggles edit mode.
 * Auto-detects language from file extension, themes via CSS custom properties,
 * and tracks dirty state (content differs from initial).
 */

import React, { useRef, useEffect, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor, hoverTooltip, Tooltip } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { linter, lintKeymap, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { LspDiagnostic } from '../../types/electron';
import { registerEditor, unregisterEditor } from './editorRegistry'

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

// ─── Per-IDE-theme syntax highlight styles ───────────────────────────────────
// Colors match the Shiki themes used in the read-only viewer:
//   retro   → monokai
//   modern  → github-dark
//   warp    → dracula
//   cursor  → tokyo-night
//   kiro    → catppuccin-mocha

const highlightStyles: Record<string, HighlightStyle> = {
  // Monokai
  retro: HighlightStyle.define([
    { tag: tags.keyword,                          color: '#F92672', fontWeight: 'bold' },
    { tag: tags.controlKeyword,                   color: '#F92672', fontWeight: 'bold' },
    { tag: tags.definitionKeyword,                color: '#F92672', fontWeight: 'bold' },
    { tag: tags.comment,                          color: '#75715E', fontStyle: 'italic' },
    { tag: tags.lineComment,                      color: '#75715E', fontStyle: 'italic' },
    { tag: tags.blockComment,                     color: '#75715E', fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string)], color: '#E6DB74' },
    { tag: tags.regexp,                           color: '#E6DB74' },
    { tag: [tags.number, tags.integer, tags.float], color: '#AE81FF' },
    { tag: tags.bool,                             color: '#AE81FF' },
    { tag: tags.null,                             color: '#AE81FF' },
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: '#A6E22E' },
    { tag: tags.definition(tags.function(tags.name)), color: '#A6E22E' },
    { tag: [tags.typeName, tags.className],       color: '#66D9EF', fontStyle: 'italic' },
    { tag: tags.typeOperator,                     color: '#F92672' },
    { tag: [tags.variableName, tags.name],        color: '#F8F8F2' },
    { tag: tags.definition(tags.variableName),    color: '#F8F8F2' },
    { tag: tags.propertyName,                     color: '#A6E22E' },
    { tag: tags.operator,                         color: '#F92672' },
    { tag: tags.punctuation,                      color: '#F8F8F2' },
    { tag: tags.bracket,                          color: '#F8F8F2' },
    { tag: tags.angleBracket,                     color: '#F8F8F2' },
    { tag: tags.namespace,                        color: '#66D9EF' },
    { tag: tags.meta,                             color: '#75715E' },
    { tag: tags.tagName,                          color: '#F92672' },
    { tag: tags.attributeName,                    color: '#A6E22E' },
    { tag: tags.attributeValue,                   color: '#E6DB74' },
    { tag: tags.heading,                          color: '#F92672', fontWeight: 'bold' },
    { tag: tags.strong,                           fontWeight: 'bold' },
    { tag: tags.emphasis,                         fontStyle: 'italic' },
    { tag: tags.link,                             color: '#66D9EF', textDecoration: 'underline' },
    { tag: tags.url,                              color: '#E6DB74' },
  ]),

  // GitHub Dark
  modern: HighlightStyle.define([
    { tag: tags.keyword,                          color: '#FF7B72', fontWeight: 'bold' },
    { tag: tags.controlKeyword,                   color: '#FF7B72', fontWeight: 'bold' },
    { tag: tags.definitionKeyword,                color: '#FF7B72', fontWeight: 'bold' },
    { tag: tags.comment,                          color: '#8B949E', fontStyle: 'italic' },
    { tag: tags.lineComment,                      color: '#8B949E', fontStyle: 'italic' },
    { tag: tags.blockComment,                     color: '#8B949E', fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string)], color: '#A5D6FF' },
    { tag: tags.regexp,                           color: '#A5D6FF' },
    { tag: [tags.number, tags.integer, tags.float], color: '#79C0FF' },
    { tag: tags.bool,                             color: '#79C0FF' },
    { tag: tags.null,                             color: '#79C0FF' },
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: '#D2A8FF' },
    { tag: tags.definition(tags.function(tags.name)), color: '#D2A8FF' },
    { tag: [tags.typeName, tags.className],       color: '#FFA657' },
    { tag: tags.typeOperator,                     color: '#FF7B72' },
    { tag: [tags.variableName, tags.name],        color: '#E6EDF3' },
    { tag: tags.definition(tags.variableName),    color: '#E6EDF3' },
    { tag: tags.propertyName,                     color: '#79C0FF' },
    { tag: tags.operator,                         color: '#FF7B72' },
    { tag: tags.punctuation,                      color: '#E6EDF3' },
    { tag: tags.bracket,                          color: '#E6EDF3' },
    { tag: tags.angleBracket,                     color: '#E6EDF3' },
    { tag: tags.namespace,                        color: '#FFA657' },
    { tag: tags.meta,                             color: '#8B949E' },
    { tag: tags.tagName,                          color: '#7EE787' },
    { tag: tags.attributeName,                    color: '#79C0FF' },
    { tag: tags.attributeValue,                   color: '#A5D6FF' },
    { tag: tags.heading,                          color: '#FF7B72', fontWeight: 'bold' },
    { tag: tags.strong,                           fontWeight: 'bold' },
    { tag: tags.emphasis,                         fontStyle: 'italic' },
    { tag: tags.link,                             color: '#A5D6FF', textDecoration: 'underline' },
    { tag: tags.url,                              color: '#A5D6FF' },
  ]),

  // Dracula
  warp: HighlightStyle.define([
    { tag: tags.keyword,                          color: '#FF79C6', fontWeight: 'bold' },
    { tag: tags.controlKeyword,                   color: '#FF79C6', fontWeight: 'bold' },
    { tag: tags.definitionKeyword,                color: '#FF79C6', fontWeight: 'bold' },
    { tag: tags.comment,                          color: '#6272A4', fontStyle: 'italic' },
    { tag: tags.lineComment,                      color: '#6272A4', fontStyle: 'italic' },
    { tag: tags.blockComment,                     color: '#6272A4', fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string)], color: '#F1FA8C' },
    { tag: tags.regexp,                           color: '#F1FA8C' },
    { tag: [tags.number, tags.integer, tags.float], color: '#BD93F9' },
    { tag: tags.bool,                             color: '#BD93F9' },
    { tag: tags.null,                             color: '#BD93F9' },
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: '#50FA7B' },
    { tag: tags.definition(tags.function(tags.name)), color: '#50FA7B' },
    { tag: [tags.typeName, tags.className],       color: '#8BE9FD', fontStyle: 'italic' },
    { tag: tags.typeOperator,                     color: '#FF79C6' },
    { tag: [tags.variableName, tags.name],        color: '#F8F8F2' },
    { tag: tags.definition(tags.variableName),    color: '#F8F8F2' },
    { tag: tags.propertyName,                     color: '#66D9EF' },
    { tag: tags.operator,                         color: '#FF79C6' },
    { tag: tags.punctuation,                      color: '#F8F8F2' },
    { tag: tags.bracket,                          color: '#F8F8F2' },
    { tag: tags.angleBracket,                     color: '#F8F8F2' },
    { tag: tags.namespace,                        color: '#8BE9FD' },
    { tag: tags.meta,                             color: '#6272A4' },
    { tag: tags.tagName,                          color: '#FF79C6' },
    { tag: tags.attributeName,                    color: '#50FA7B' },
    { tag: tags.attributeValue,                   color: '#F1FA8C' },
    { tag: tags.heading,                          color: '#BD93F9', fontWeight: 'bold' },
    { tag: tags.strong,                           fontWeight: 'bold' },
    { tag: tags.emphasis,                         fontStyle: 'italic' },
    { tag: tags.link,                             color: '#8BE9FD', textDecoration: 'underline' },
    { tag: tags.url,                              color: '#F1FA8C' },
  ]),

  // Tokyo Night
  cursor: HighlightStyle.define([
    { tag: tags.keyword,                          color: '#BB9AF7', fontWeight: 'bold' },
    { tag: tags.controlKeyword,                   color: '#BB9AF7', fontWeight: 'bold' },
    { tag: tags.definitionKeyword,                color: '#BB9AF7', fontWeight: 'bold' },
    { tag: tags.comment,                          color: '#565F89', fontStyle: 'italic' },
    { tag: tags.lineComment,                      color: '#565F89', fontStyle: 'italic' },
    { tag: tags.blockComment,                     color: '#565F89', fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string)], color: '#9ECE6A' },
    { tag: tags.regexp,                           color: '#9ECE6A' },
    { tag: [tags.number, tags.integer, tags.float], color: '#FF9E64' },
    { tag: tags.bool,                             color: '#FF9E64' },
    { tag: tags.null,                             color: '#FF9E64' },
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: '#7AA2F7' },
    { tag: tags.definition(tags.function(tags.name)), color: '#7AA2F7' },
    { tag: [tags.typeName, tags.className],       color: '#2AC3DE' },
    { tag: tags.typeOperator,                     color: '#BB9AF7' },
    { tag: [tags.variableName, tags.name],        color: '#C0CAF5' },
    { tag: tags.definition(tags.variableName),    color: '#C0CAF5' },
    { tag: tags.propertyName,                     color: '#73DACA' },
    { tag: tags.operator,                         color: '#89DDFF' },
    { tag: tags.punctuation,                      color: '#C0CAF5' },
    { tag: tags.bracket,                          color: '#C0CAF5' },
    { tag: tags.angleBracket,                     color: '#C0CAF5' },
    { tag: tags.namespace,                        color: '#2AC3DE' },
    { tag: tags.meta,                             color: '#565F89' },
    { tag: tags.tagName,                          color: '#F7768E' },
    { tag: tags.attributeName,                    color: '#BB9AF7' },
    { tag: tags.attributeValue,                   color: '#9ECE6A' },
    { tag: tags.heading,                          color: '#7AA2F7', fontWeight: 'bold' },
    { tag: tags.strong,                           fontWeight: 'bold' },
    { tag: tags.emphasis,                         fontStyle: 'italic' },
    { tag: tags.link,                             color: '#73DACA', textDecoration: 'underline' },
    { tag: tags.url,                              color: '#9ECE6A' },
  ]),

  // Catppuccin Mocha
  kiro: HighlightStyle.define([
    { tag: tags.keyword,                          color: '#CBA6F7', fontWeight: 'bold' },
    { tag: tags.controlKeyword,                   color: '#CBA6F7', fontWeight: 'bold' },
    { tag: tags.definitionKeyword,                color: '#CBA6F7', fontWeight: 'bold' },
    { tag: tags.comment,                          color: '#6C7086', fontStyle: 'italic' },
    { tag: tags.lineComment,                      color: '#6C7086', fontStyle: 'italic' },
    { tag: tags.blockComment,                     color: '#6C7086', fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string)], color: '#A6E3A1' },
    { tag: tags.regexp,                           color: '#A6E3A1' },
    { tag: [tags.number, tags.integer, tags.float], color: '#FAB387' },
    { tag: tags.bool,                             color: '#FAB387' },
    { tag: tags.null,                             color: '#FAB387' },
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: '#89B4FA' },
    { tag: tags.definition(tags.function(tags.name)), color: '#89B4FA' },
    { tag: [tags.typeName, tags.className],       color: '#F38BA8' },
    { tag: tags.typeOperator,                     color: '#CBA6F7' },
    { tag: [tags.variableName, tags.name],        color: '#CDD6F4' },
    { tag: tags.definition(tags.variableName),    color: '#CDD6F4' },
    { tag: tags.propertyName,                     color: '#89DCEB' },
    { tag: tags.operator,                         color: '#89DCEB' },
    { tag: tags.punctuation,                      color: '#CDD6F4' },
    { tag: tags.bracket,                          color: '#CDD6F4' },
    { tag: tags.angleBracket,                     color: '#CDD6F4' },
    { tag: tags.namespace,                        color: '#F38BA8' },
    { tag: tags.meta,                             color: '#6C7086' },
    { tag: tags.tagName,                          color: '#F38BA8' },
    { tag: tags.attributeName,                    color: '#89B4FA' },
    { tag: tags.attributeValue,                   color: '#A6E3A1' },
    { tag: tags.heading,                          color: '#CBA6F7', fontWeight: 'bold' },
    { tag: tags.strong,                           fontWeight: 'bold' },
    { tag: tags.emphasis,                         fontStyle: 'italic' },
    { tag: tags.link,                             color: '#89DCEB', textDecoration: 'underline' },
    { tag: tags.url,                              color: '#A6E3A1' },
  ]),
};

// Fall back to github-dark if theme not found
const DEFAULT_HIGHLIGHT = highlightStyles.modern;

function getHighlightStyle(themeId: string): HighlightStyle {
  return highlightStyles[themeId] ?? DEFAULT_HIGHLIGHT;
}

// ─── Base editor chrome theme (non-syntax colors from CSS vars) ──────────────

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

// ─── LSP helpers ──────────────────────────────────────────────────────────────

/** Map LSP CompletionItem.kind string to CodeMirror completion type */
function lspKindToCmType(kind: string): string {
  const map: Record<string, string> = {
    method: 'method',
    function: 'function',
    constructor: 'class',
    field: 'property',
    variable: 'variable',
    class: 'class',
    interface: 'interface',
    module: 'namespace',
    property: 'property',
    unit: 'constant',
    value: 'constant',
    enum: 'enum',
    keyword: 'keyword',
    snippet: 'text',
    color: 'constant',
    file: 'variable',
    reference: 'variable',
    folder: 'variable',
    enumMember: 'enum',
    constant: 'constant',
    struct: 'class',
    event: 'variable',
    operator: 'keyword',
    typeParameter: 'type',
  };
  return map[kind] ?? 'text';
}

/** Map LSP diagnostic severity to CodeMirror severity */
function lspSeverityToCm(severity: LspDiagnostic['severity']): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'info';
    case 'hint': return 'info';
    default: return 'info';
  }
}

/** Convert a 0-based line/character to a CodeMirror offset, clamped to doc bounds */
function lspPosToCmOffset(doc: { line: (n: number) => { from: number; to: number }; lines: number; length: number }, line: number, character: number): number {
  // LSP lines are 0-based; CodeMirror doc.line() is 1-based
  const cmLineNum = Math.min(line + 1, doc.lines);
  const lineInfo = doc.line(cmLineNum);
  return Math.min(lineInfo.from + character, lineInfo.to);
}

/** Convert a CodeMirror offset to 0-based LSP line/character */
function cmOffsetToLspPos(doc: { lineAt: (pos: number) => { number: number; from: number } }, offset: number): { line: number; character: number } {
  const lineInfo = doc.lineAt(offset);
  return { line: lineInfo.number - 1, character: offset - lineInfo.from };
}

/** Check if the electronAPI.lsp is available */
function hasLspApi(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && !!window.electronAPI?.lsp;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InlineEditorProps {
  content: string;
  filePath: string;
  themeId: string;
  /** Project root — required for LSP integration */
  projectRoot?: string | null;
  onSave: (content: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

// ─── Imperative handle ────────────────────────────────────────────────────────

export interface InlineEditorHandle {
  getContent(): string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InlineEditor = memo(forwardRef<InlineEditorHandle, InlineEditorProps>(function InlineEditor({
  content,
  filePath,
  themeId,
  projectRoot,
  onSave,
  onDirtyChange,
}: InlineEditorProps, ref): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const lspCompartment = useRef(new Compartment());
  const initialContentRef = useRef(content);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // Stable refs so LSP extensions can read current values without re-creating the editor
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const projectRootRef = useRef(projectRoot);
  projectRootRef.current = projectRoot;

  const isDirtyRef = useRef(false);
  /** Tracks pending didChange calls to debounce */
  const didChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose imperative handle so parents can read live editor content
  useImperativeHandle(ref, () => ({
    getContent: () => viewRef.current?.state.doc.toString() ?? '',
  }));

  // ─── LSP completion source ──────────────────────────────────────────────────

  const lspCompletionSource = useCallback(async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const root = projectRootRef.current;
    const fp = filePathRef.current;
    if (!root || !fp || !hasLspApi()) return null;

    const pos = cmOffsetToLspPos(ctx.state.doc, ctx.pos);

    try {
      const result = await window.electronAPI.lsp.completion(root, fp, pos.line, pos.character);
      if (!result.success || !result.items || result.items.length === 0) return null;

      // Find the start of the current word for the completion range
      const word = ctx.matchBefore(/[\w$]*/);
      const from = word ? word.from : ctx.pos;

      return {
        from,
        options: result.items.map((item) => ({
          label: item.label,
          type: lspKindToCmType(item.kind),
          detail: item.detail,
          apply: item.insertText ?? item.label,
          info: item.documentation || undefined,
        })),
      };
    } catch {
      // LSP not available or errored — fall through to built-in completions
      return null;
    }
  }, []);

  // ─── LSP hover tooltip ──────────────────────────────────────────────────────

  const lspHoverTooltipSource = useMemo(() => (
    hoverTooltip(async (view: EditorView, pos: number): Promise<Tooltip | null> => {
      const root = projectRootRef.current;
      const fp = filePathRef.current;
      if (!root || !fp || !hasLspApi()) return null;

      const lspPos = cmOffsetToLspPos(view.state.doc, pos);

      try {
        const result = await window.electronAPI.lsp.hover(root, fp, lspPos.line, lspPos.character);
        if (!result.success || !result.contents) return null;

        // Find the word boundaries for tooltip positioning
        const wordAt = view.state.wordAt(pos);
        const from = wordAt?.from ?? pos;

        return {
          pos: from,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-lsp-hover';
            dom.style.cssText = 'padding: 4px 8px; max-width: 500px; max-height: 300px; overflow: auto; white-space: pre-wrap; font-family: var(--font-mono); font-size: 0.75rem; line-height: 1.5;';

            // Render as plain text (LSP may return markdown but we keep it simple)
            const text = result.contents!;
            // Strip markdown code fences for cleaner display
            const cleaned = text
              .replace(/^```[\w]*\n?/gm, '')
              .replace(/^```$/gm, '')
              .trim();
            dom.textContent = cleaned;
            return { dom };
          },
        };
      } catch {
        return null;
      }
    }, { hoverTime: 300 })
  ), []);

  // ─── LSP diagnostics linter ─────────────────────────────────────────────────

  /** Ref holding the latest LSP diagnostics for the current file */
  const diagnosticsRef = useRef<LspDiagnostic[]>([]);

  const lspLinter = useMemo(() => (
    linter((view: EditorView): CmDiagnostic[] => {
      const diags = diagnosticsRef.current;
      if (!diags || diags.length === 0) return [];

      return diags.map((d) => {
        const from = lspPosToCmOffset(view.state.doc, d.range.startLine, d.range.startChar);
        const to = lspPosToCmOffset(view.state.doc, d.range.endLine, d.range.endChar);
        return {
          from,
          to: Math.max(to, from), // Ensure to >= from
          severity: lspSeverityToCm(d.severity),
          message: d.message,
        };
      });
    }, { delay: 500 })
  ), []);

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

        // ── LSP didChange (debounced) ──
        const root = projectRootRef.current;
        const fp = filePathRef.current;
        if (root && fp && hasLspApi()) {
          if (didChangeTimerRef.current) clearTimeout(didChangeTimerRef.current);
          didChangeTimerRef.current = setTimeout(() => {
            window.electronAPI.lsp.didChange(root, fp, update.state.doc.toString()).catch(() => {});
          }, 200);
        }
      }
    });

    // Build LSP extensions (they read from refs, so stable across file changes)
    const lspExtensions = [
      autocompletion({ override: [lspCompletionSource] }),
      lspHoverTooltipSource,
      lspLinter,
    ];

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
      highlightSelectionMatches(),
      highlightCompartment.current.of(
        syntaxHighlighting(getHighlightStyle(filePath ? themeId : 'modern'), { fallback: true })
      ),
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
      lspCompartment.current.of(lspExtensions),
      editorTheme,
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
    registerEditor(filePath, view);

    return () => {
      unregisterEditor(filePath);
      if (didChangeTimerRef.current) clearTimeout(didChangeTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // Only create editor once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── LSP lifecycle: didOpen / didClose + diagnostics subscription ───────────

  useEffect(() => {
    const root = projectRootRef.current;
    const fp = filePathRef.current;
    if (!root || !fp || !hasLspApi()) return;

    // Notify LSP server that we opened this document
    const currentContent = viewRef.current?.state.doc.toString() ?? content;
    window.electronAPI.lsp.didOpen(root, fp, currentContent).catch(() => {});

    // Subscribe to pushed diagnostics for this file
    const cleanupDiagnostics = window.electronAPI.lsp.onDiagnostics((event) => {
      // Normalize paths for comparison (Windows backslash vs forward slash)
      const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();
      if (normalize(event.filePath) === normalize(fp)) {
        diagnosticsRef.current = event.diagnostics;
        // Force the linter to re-run by dispatching a no-op transaction
        const view = viewRef.current;
        if (view) {
          // Use requestAnimationFrame to avoid dispatching during an update
          requestAnimationFrame(() => {
            if (viewRef.current) {
              viewRef.current.dispatch({});
            }
          });
        }
      }
    });

    return () => {
      // Notify LSP server that we closed this document
      if (hasLspApi()) {
        window.electronAPI.lsp.didClose(root, fp).catch(() => {});
      }
      cleanupDiagnostics();
      diagnosticsRef.current = [];
    };
  }, [filePath, content, projectRoot]);

  // Swap highlight style when IDE theme changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: highlightCompartment.current.reconfigure(
        syntaxHighlighting(getHighlightStyle(themeId), { fallback: true })
      ),
    });
  }, [themeId]);

  // When filePath changes, update language and replace document
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    initialContentRef.current = content;
    isDirtyRef.current = false;
    onDirtyChangeRef.current(false);

    const langExt = getLanguageExtension(filePath);

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: content,
      },
    });

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
}));

export type { InlineEditorProps as InlineEditorProps };
