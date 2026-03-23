import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { drawSelection, EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
export interface RichInputProps { sessionId: string; onSubmit: (text: string) => void; onCancel: () => void; visible: boolean; shellType?: 'bash' | 'zsh' | 'powershell' | 'cmd'; }

type HistoryDirection = 'up' | 'down';
type HistoryRefs = { currentDraft: React.MutableRefObject<string>; historyIndex: React.MutableRefObject<number>; historyItems: React.MutableRefObject<string[]> };
type ViewRef = React.MutableRefObject<EditorView | null>;
type CompartmentRef = React.MutableRefObject<Compartment>;
type EditorMountOptions = { containerRef: React.RefObject<HTMLDivElement | null>; doCancel: () => void; doSubmit: () => void; highlightCompartment: CompartmentRef; lineNumCompartment: CompartmentRef; navigateHistory: (direction: HistoryDirection) => void; viewRef: ViewRef };
const MAX_HISTORY = 50;
const shellTokenMatchers = [
  { pattern: /"([^"\\]|\\.)*"/, token: 'string' },
  { pattern: /'[^']*'/, token: 'string' },
  { pattern: /`[^`]*`/, token: 'string' },
  { pattern: /\$\{[^}]*\}/, token: 'variableName' },
  { pattern: /\$[A-Za-z_][A-Za-z0-9_]*/, token: 'variableName' },
  { pattern: /\$[0-9#?@!$*-]/, token: 'variableName' },
  { pattern: /\b\d+\b/, token: 'number' },
  { pattern: /[|&;><]+/, token: 'operator' },
  { pattern: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|source|alias|unalias|local|readonly|declare|typeset|set|unset|shift|trap|break|continue|select|until|coproc|time)\b/, token: 'keyword' },
  { pattern: /\b(cd|ls|cp|mv|rm|mkdir|rmdir|cat|echo|grep|sed|awk|find|sort|uniq|wc|head|tail|chmod|chown|curl|wget|git|npm|npx|node|python|pip|docker|ssh|scp|tar|zip|unzip|make|cmake|cargo|go|rustc|gcc|clang|claude)\b/, token: 'atom' },
  { pattern: /-{1,2}[A-Za-z0-9_-]+/, token: 'attributeName' },
] as const;

const shellLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    for (const matcher of shellTokenMatchers) {
      if (stream.match(matcher.pattern)) return matcher.token;
    }
    stream.next();
    return null;
  },
  startState() {
    return {};
  },
});
const richInputHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--rich-input-keyword, #ff79c6)' },
  { tag: tags.comment, color: 'var(--rich-input-comment, #6272a4)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--rich-input-string, #f1fa8c)' },
  { tag: tags.variableName, color: 'var(--rich-input-variable, #8be9fd)' },
  { tag: tags.number, color: 'var(--rich-input-number, #bd93f9)' },
  { tag: tags.operator, color: 'var(--rich-input-operator, #ff79c6)' },
  { tag: tags.atom, color: 'var(--rich-input-command, #50fa7b)' },
  { tag: tags.attributeName, color: 'var(--rich-input-flag, #ffb86c)' },
]);
const richInputEditorTheme = EditorView.theme({
  '&': { fontSize: 'var(--term-font-size, 13px)', backgroundColor: 'transparent', color: 'var(--term-fg, var(--text, #f8f8f2))' },
  '.cm-scroller': { fontFamily: 'var(--font-mono, monospace)', lineHeight: '1.5', overflow: 'auto', maxHeight: 'calc(1.5em * 10 + 16px)' },
  '.cm-content': { caretColor: 'var(--term-cursor, var(--accent, #f8f8f0))', padding: '8px 4px', minHeight: '4em' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--term-cursor, var(--accent, #f8f8f0))' },
  '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--term-selection, rgba(88,166,255,0.25))' },
  '.cm-selectionBackground': { backgroundColor: 'var(--term-selection, rgba(88,166,255,0.15))' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-semantic-faint, #555)', borderRight: '1px solid var(--border, #333)', minWidth: '2.5em' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-scroller::-webkit-scrollbar': { width: '6px' },
  '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
  '.cm-scroller::-webkit-scrollbar-thumb': { background: 'var(--border, #444)', borderRadius: '3px' },
});
const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 8px', borderBottom: '1px solid var(--border, #333)',
  backgroundColor: 'var(--rich-input-toolbar-bg, rgba(40,40,40,0.9))', minHeight: 24,
};
const toolbarPrimaryStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--font-ui, sans-serif)', userSelect: 'none',
};
const toolbarSecondaryStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'var(--font-ui, sans-serif)', userSelect: 'none',
};
const toolbarTitleStyle: React.CSSProperties = { fontWeight: 600, letterSpacing: '0.02em' };
const dividerStyle: React.CSSProperties = { color: 'var(--border, #444)' };
const panelStyle: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
  borderTop: '2px solid var(--accent, #58a6ff)', backgroundColor: 'var(--rich-input-bg, rgba(30,30,30,0.97))', display: 'flex',
  flexDirection: 'column', overflow: 'hidden', animation: 'richInputSlideUp 0.15s ease-out',
  minHeight: '120px', maxHeight: '50%',
};
const editorHostStyle: React.CSSProperties = { overflow: 'auto', minHeight: '6em', flex: '1 1 auto' };
const richInputAnimationCss = '@keyframes richInputSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }';
function getLineNumberButtonStyle(showLineNumbers: boolean): React.CSSProperties {
  return {
    background: 'none', border: showLineNumbers ? '1px solid var(--accent, #58a6ff)' : '1px solid transparent', borderRadius: 3,
    color: showLineNumbers ? 'var(--accent, #58a6ff)' : 'var(--text-semantic-faint, #666)', cursor: 'pointer', fontSize: 10, padding: '1px 5px',
    fontFamily: 'var(--font-ui, sans-serif)',
  };
}
function ToolbarStart({ onToggleLineNumbers, showLineNumbers }: { onToggleLineNumbers: () => void; showLineNumbers: boolean }): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={toolbarPrimaryStyle}>
      <span style={toolbarTitleStyle}>Multi-line Input</span>
      <button onClick={onToggleLineNumbers} title="Toggle line numbers" style={getLineNumberButtonStyle(showLineNumbers)}>#</button>
    </div>
  );
}
function ToolbarEnd({ doCancel, doSubmit }: { doCancel: () => void; doSubmit: () => void }): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={toolbarSecondaryStyle}>
      <span>Ctrl+Up/Down: history</span>
      <span style={dividerStyle}>|</span>
      <span>Esc: cancel</span>
      <button
        onClick={doCancel}
        title="Close multi-line input"
        style={{ background: 'transparent', border: '1px solid var(--border, #444)', borderRadius: 3, color: 'var(--text-semantic-muted, #a0a0a0)', cursor: 'pointer', fontSize: 10, padding: '2px 8px', fontFamily: 'var(--font-ui, sans-serif)' }}
      >
        Close
      </button>
      <button
        onClick={doSubmit}
        title="Submit (Ctrl+Enter)"
        style={{ background: 'var(--accent, #58a6ff)', border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer', fontSize: 10, padding: '2px 10px', fontFamily: 'var(--font-ui, sans-serif)', fontWeight: 600, letterSpacing: '0.02em' }}
      >
        Submit
      </button>
    </div>
  );
}
function RichInputToolbar({ doCancel, doSubmit, onToggleLineNumbers, showLineNumbers }: { doCancel: () => void; doSubmit: () => void; onToggleLineNumbers: () => void; showLineNumbers: boolean }): React.ReactElement {
  return (
    <div style={toolbarStyle}>
      <ToolbarStart onToggleLineNumbers={onToggleLineNumbers} showLineNumbers={showLineNumbers} />
      <ToolbarEnd doCancel={doCancel} doSubmit={doSubmit} />
    </div>
  );
}
function RichInputPanel({ containerRef, doCancel, doSubmit, onToggleLineNumbers, showLineNumbers }: { containerRef: React.RefObject<HTMLDivElement | null>; doCancel: () => void; doSubmit: () => void; onToggleLineNumbers: () => void; showLineNumbers: boolean }): React.ReactElement {
  return (
    <div style={panelStyle}>
      <RichInputToolbar doCancel={doCancel} doSubmit={doSubmit} onToggleLineNumbers={onToggleLineNumbers} showLineNumbers={showLineNumbers} />
      <div ref={containerRef} style={editorHostStyle} />
      <style>{richInputAnimationCss}</style>
    </div>
  );
}
function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
function replaceDocument(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
}
function resetHistoryState({ currentDraft, historyIndex }: Pick<HistoryRefs, 'currentDraft' | 'historyIndex'>): void {
  historyIndex.current = -1;
  currentDraft.current = '';
}
function pushHistoryItem(historyItems: React.MutableRefObject<string[]>, text: string): void {
  const items = historyItems.current;
  const existingIndex = items.indexOf(text);
  if (existingIndex >= 0) items.splice(existingIndex, 1);
  items.unshift(text);
  if (items.length > MAX_HISTORY) items.length = MAX_HISTORY;
}
function getNextHistoryIndex(direction: HistoryDirection, currentIndex: number, itemCount: number): number | null {
  if (direction === 'up') return currentIndex === -1 ? 0 : currentIndex < itemCount - 1 ? currentIndex + 1 : null;
  return currentIndex <= 0 ? -1 : currentIndex - 1;
}
function useSubmitAction({ currentDraft, historyIndex, historyItems, onSubmit, viewRef }: HistoryRefs & { onSubmit: (text: string) => void; viewRef: ViewRef }): () => void {
  const onSubmitRef = useLatestRef(onSubmit);
  return useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString().trim();
    if (!text) return;
    pushHistoryItem(historyItems, text);
    resetHistoryState({ currentDraft, historyIndex });
    replaceDocument(view, '');
    onSubmitRef.current(text);
  }, [currentDraft, historyIndex, historyItems, onSubmitRef, viewRef]);
}
function useCancelAction({ currentDraft, historyIndex, onCancel, viewRef }: Pick<HistoryRefs, 'currentDraft' | 'historyIndex'> & { onCancel: () => void; viewRef: ViewRef }): () => void {
  const onCancelRef = useLatestRef(onCancel);
  return useCallback(() => {
    const view = viewRef.current;
    if (view) replaceDocument(view, '');
    resetHistoryState({ currentDraft, historyIndex });
    onCancelRef.current();
  }, [currentDraft, historyIndex, onCancelRef, viewRef]);
}
function useHistoryNavigation({ currentDraft, historyIndex, historyItems, viewRef }: HistoryRefs & { viewRef: ViewRef }): (direction: HistoryDirection) => void {
  return useCallback((direction: HistoryDirection) => {
    const view = viewRef.current;
    if (!view || historyItems.current.length === 0) return;
    if (direction === 'up' && historyIndex.current === -1) currentDraft.current = view.state.doc.toString();
    const nextIndex = getNextHistoryIndex(direction, historyIndex.current, historyItems.current.length);
    if (nextIndex === null) return;
    historyIndex.current = nextIndex;
    replaceDocument(view, nextIndex === -1 ? currentDraft.current : historyItems.current[nextIndex]);
  }, [currentDraft, historyIndex, historyItems, viewRef]);
}
function runEditorAction(action: () => void): boolean {
  action();
  return true;
}
function createRichInputKeymap(doSubmit: () => void, doCancel: () => void, navigateHistory: (direction: HistoryDirection) => void) {
  return keymap.of([
    { key: 'Ctrl-Enter', run: () => runEditorAction(doSubmit) },
    { key: 'Shift-Enter', run: () => runEditorAction(doSubmit) },
    { key: 'Escape', run: () => runEditorAction(doCancel) },
    { key: 'Ctrl-ArrowUp', run: () => runEditorAction(() => navigateHistory('up')) },
    { key: 'Ctrl-ArrowDown', run: () => runEditorAction(() => navigateHistory('down')) },
  ]);
}
function createEditorExtensions(keyBinding: ReturnType<typeof createRichInputKeymap>, highlightCompartment: Compartment, lineNumCompartment: Compartment) {
  return [
    Prec.highest(keyBinding),
    lineNumCompartment.of([]),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightCompartment.of(syntaxHighlighting(richInputHighlightStyle, { fallback: true })),
    shellLanguage,
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    richInputEditorTheme,
    cmPlaceholder('Type a command... (Ctrl+Enter to submit, Esc to cancel)'),
  ];
}
function createEditorView({ doCancel, doSubmit, highlightCompartment, lineNumCompartment, navigateHistory, parent }: { doCancel: () => void; doSubmit: () => void; highlightCompartment: Compartment; lineNumCompartment: Compartment; navigateHistory: (direction: HistoryDirection) => void; parent: HTMLDivElement }): EditorView {
  const keyBinding = createRichInputKeymap(doSubmit, doCancel, navigateHistory);
  const extensions = createEditorExtensions(keyBinding, highlightCompartment, lineNumCompartment);
  return new EditorView({ state: EditorState.create({ doc: '', extensions }), parent });
}
function useRichInputEditorMount({ containerRef, doCancel, doSubmit, highlightCompartment, lineNumCompartment, navigateHistory, viewRef }: EditorMountOptions): void {
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    viewRef.current = createEditorView({ doCancel, doSubmit, highlightCompartment: highlightCompartment.current, lineNumCompartment: lineNumCompartment.current, navigateHistory, parent });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [containerRef, doCancel, doSubmit, highlightCompartment, lineNumCompartment, navigateHistory, viewRef]);
}
function useVisibleFocus(viewRef: ViewRef, visible: boolean): void {
  useEffect(() => {
    if (!visible || !viewRef.current) return;
    // Double-rAF to ensure CodeMirror DOM is fully ready (same pattern as xterm)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewRef.current?.focus();
      });
    });
    // Fallback in case rAFs don't fire (e.g. tab not visible)
    const timer = setTimeout(() => { viewRef.current?.focus(); }, 100);
    return () => clearTimeout(timer);
  }, [viewRef, visible]);
}
function useLineNumberConfig(lineNumCompartment: CompartmentRef, showLineNumbers: boolean, viewRef: ViewRef): void {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: lineNumCompartment.current.reconfigure(showLineNumbers ? lineNumbers() : []) });
  }, [lineNumCompartment, showLineNumbers, viewRef]);
}
export const RichInputBody = memo(function RichInputBody({ onCancel, onSubmit, visible }: RichInputProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const highlightCompartment = useRef(new Compartment());
  const lineNumCompartment = useRef(new Compartment());
  const historyItems = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const currentDraft = useRef('');
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const doSubmit = useSubmitAction({ currentDraft, historyIndex, historyItems, onSubmit, viewRef });
  const doCancel = useCancelAction({ currentDraft, historyIndex, onCancel, viewRef });
  const navigateHistory = useHistoryNavigation({ currentDraft, historyIndex, historyItems, viewRef });
  useRichInputEditorMount({ containerRef, doCancel, doSubmit, highlightCompartment, lineNumCompartment, navigateHistory, viewRef });
  useVisibleFocus(viewRef, visible);
  useLineNumberConfig(lineNumCompartment, showLineNumbers, viewRef);
  return visible ? <RichInputPanel containerRef={containerRef} doCancel={doCancel} doSubmit={doSubmit} onToggleLineNumbers={() => setShowLineNumbers((value) => !value)} showLineNumbers={showLineNumbers} /> : null;
});
