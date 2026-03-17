import { type Extension, type Text } from '@codemirror/state';
import { keymap, hoverTooltip, type Tooltip, EditorView, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { linter, lintKeymap, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { MutableRefObject } from 'react';
import type { Compartment } from '@codemirror/state';
import type { LspDiagnostic } from '../../types/electron';
import { createLanguageExtensions, getLanguageExtension } from './InlineEditor.cm.language';
import { createHighlightExtension, editorThemeExtensions } from './InlineEditor.cm.theme';

type StringRef = MutableRefObject<string>;
type NullableStringRef = MutableRefObject<string | null | undefined>;

interface CreateEditorExtensionsInput {
  filePath: string;
  themeId: string;
  languageCompartment: Compartment;
  highlightCompartment: Compartment;
  lspCompartment: Compartment;
  languageExtension: Extension | null;
  saveKeymap: Extension;
  updateListener: Extension;
  lspCompletionSource: CompletionSource;
  lspHoverTooltipSource: Extension;
  lspLinter: Extension;
}

interface CreateUpdateListenerInput {
  initialContentRef: MutableRefObject<string>;
  isDirtyRef: MutableRefObject<boolean>;
  onContentChangeRef: MutableRefObject<(content: string) => void>;
  onDirtyChangeRef: MutableRefObject<(dirty: boolean) => void>;
  didChangeTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  projectRootRef: NullableStringRef;
  filePathRef: StringRef;
}

const completionKindMap: Record<string, string> = {
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

const severityMap: Record<LspDiagnostic['severity'], 'error' | 'warning' | 'info'> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'info',
};

function getLspCompletionType(kind: string): string {
  return completionKindMap[kind] ?? 'text';
}

function getLspSeverity(severity: LspDiagnostic['severity']): 'error' | 'warning' | 'info' {
  return severityMap[severity] ?? 'info';
}

function scheduleLspDidChange(
  content: string,
  didChangeTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  projectRootRef: NullableStringRef,
  filePathRef: StringRef
): void {
  const root = projectRootRef.current;
  const filePath = filePathRef.current;
  if (!root || !filePath || !hasLspApi()) return;
  if (didChangeTimerRef.current) clearTimeout(didChangeTimerRef.current);
  didChangeTimerRef.current = setTimeout(() => {
    window.electronAPI.lsp.didChange(root, filePath, content).catch((error) => { console.error('[inlineEditor] LSP didChange notification failed:', error) });
  }, 200);
}

function updateDirtyState(
  currentContent: string,
  initialContentRef: MutableRefObject<string>,
  isDirtyRef: MutableRefObject<boolean>,
  onDirtyChangeRef: MutableRefObject<(dirty: boolean) => void>
): void {
  const dirty = currentContent !== initialContentRef.current;
  if (dirty === isDirtyRef.current) return;
  isDirtyRef.current = dirty;
  onDirtyChangeRef.current(dirty);
}

function createHoverTooltipDom(contents: string): HTMLDivElement {
  const dom = document.createElement('div');
  dom.className = 'cm-lsp-hover';
  dom.style.cssText = 'padding: 4px 8px; max-width: 500px; max-height: 300px; overflow: auto; white-space: pre-wrap; font-family: var(--font-mono); font-size: 0.75rem; line-height: 1.5;';
  dom.textContent = contents.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();
  return dom;
}

export { createLanguageExtensions, createHighlightExtension, getLanguageExtension };

export function createEditorExtensions(input: CreateEditorExtensionsInput): Extension[] {
  return [
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
    input.highlightCompartment.of(createHighlightExtension(input.filePath ? input.themeId : 'modern')),
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
    input.saveKeymap,
    input.updateListener,
    input.languageCompartment.of(createLanguageExtensions(input.languageExtension)),
    input.lspCompartment.of([
      autocompletion({ override: [input.lspCompletionSource] }),
      input.lspHoverTooltipSource,
      input.lspLinter,
    ]),
    ...editorThemeExtensions,
  ];
}

export function createSaveKeymap(onSaveRef: MutableRefObject<(content: string) => void>): Extension {
  return keymap.of([{
    key: 'Mod-s',
    run: (view) => {
      onSaveRef.current(view.state.doc.toString());
      return true;
    },
  }]);
}

export function createUpdateListener(input: CreateUpdateListenerInput): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const currentContent = update.state.doc.toString();
    input.onContentChangeRef.current(currentContent);
    updateDirtyState(currentContent, input.initialContentRef, input.isDirtyRef, input.onDirtyChangeRef);
    scheduleLspDidChange(currentContent, input.didChangeTimerRef, input.projectRootRef, input.filePathRef);
  });
}

export function lspPosToCmOffset(doc: Pick<Text, 'line' | 'lines'>, line: number, character: number): number {
  const cmLineNumber = Math.min(line + 1, doc.lines);
  const lineInfo = doc.line(cmLineNumber);
  return Math.min(lineInfo.from + character, lineInfo.to);
}

export function cmOffsetToLspPos(doc: Pick<Text, 'lineAt'>, offset: number): { line: number; character: number } {
  const lineInfo = doc.lineAt(offset);
  return { line: lineInfo.number - 1, character: offset - lineInfo.from };
}

export function hasLspApi(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && !!window.electronAPI?.lsp;
}

export function createLspCompletionSource(filePathRef: StringRef, projectRootRef: NullableStringRef): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const root = projectRootRef.current;
    const filePath = filePathRef.current;
    if (!root || !filePath || !hasLspApi()) return null;

    try {
      const position = cmOffsetToLspPos(context.state.doc, context.pos);
      const result = await window.electronAPI.lsp.completion(root, filePath, position.line, position.character);
      if (!result.success || !result.items?.length) return null;

      const word = context.matchBefore(/[\w$]*/);
      return {
        from: word?.from ?? context.pos,
        options: result.items.map((item) => ({
          label: item.label,
          type: getLspCompletionType(item.kind),
          detail: item.detail,
          apply: item.insertText ?? item.label,
          info: item.documentation || undefined,
        })),
      };
    } catch {
      return null;
    }
  };
}

export function createLspHoverTooltipSource(filePathRef: StringRef, projectRootRef: NullableStringRef): Extension {
  return hoverTooltip(async (view: EditorView, pos: number): Promise<Tooltip | null> => {
    const root = projectRootRef.current;
    const filePath = filePathRef.current;
    if (!root || !filePath || !hasLspApi()) return null;

    try {
      const position = cmOffsetToLspPos(view.state.doc, pos);
      const result = await window.electronAPI.lsp.hover(root, filePath, position.line, position.character);
      const contents = result.contents;
      if (!result.success || typeof contents !== 'string' || contents.length === 0) return null;

      return {
        pos: view.state.wordAt(pos)?.from ?? pos,
        above: true,
        create: () => ({ dom: createHoverTooltipDom(contents) }),
      };
    } catch {
      return null;
    }
  }, { hoverTime: 300 });
}

export function createLspLinter(diagnosticsRef: MutableRefObject<LspDiagnostic[]>): Extension {
  return linter((view): CmDiagnostic[] => {
    if (diagnosticsRef.current.length === 0) return [];
    return diagnosticsRef.current.map((diagnostic) => ({
      from: lspPosToCmOffset(view.state.doc, diagnostic.range.startLine, diagnostic.range.startChar),
      to: Math.max(
        lspPosToCmOffset(view.state.doc, diagnostic.range.endLine, diagnostic.range.endChar),
        lspPosToCmOffset(view.state.doc, diagnostic.range.startLine, diagnostic.range.startChar)
      ),
      severity: getLspSeverity(diagnostic.severity),
      message: diagnostic.message,
    }));
  }, { delay: 500 });
}

export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}
