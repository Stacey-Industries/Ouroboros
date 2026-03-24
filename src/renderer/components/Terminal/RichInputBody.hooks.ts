import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  richInputEditorTheme,
  richInputHighlightExtension,
  shellLanguage,
} from './RichInputBody.styles';

type HistoryDirection = 'up' | 'down';
type HistoryRefs = {
  currentDraft: React.MutableRefObject<string>;
  historyIndex: React.MutableRefObject<number>;
  historyItems: React.MutableRefObject<string[]>;
};
export type ViewRef = React.MutableRefObject<EditorView | null>;
export type CompartmentRef = React.MutableRefObject<Compartment>;

const MAX_HISTORY = 50;

export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function replaceDocument(view: EditorView, text: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: text.length },
  });
}

function resetHistoryState({
  currentDraft,
  historyIndex,
}: Pick<HistoryRefs, 'currentDraft' | 'historyIndex'>): void {
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
function getNextHistoryIndex(
  direction: HistoryDirection,
  currentIndex: number,
  itemCount: number,
): number | null {
  if (direction === 'up')
    return currentIndex === -1 ? 0 : currentIndex < itemCount - 1 ? currentIndex + 1 : null;
  return currentIndex <= 0 ? -1 : currentIndex - 1;
}

export function useSubmitAction({
  currentDraft,
  historyIndex,
  historyItems,
  onSubmit,
  viewRef,
}: HistoryRefs & { onSubmit: (text: string) => void; viewRef: ViewRef }): () => void {
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

export function useCancelAction({
  currentDraft,
  historyIndex,
  onCancel,
  viewRef,
}: Pick<HistoryRefs, 'currentDraft' | 'historyIndex'> & {
  onCancel: () => void;
  viewRef: ViewRef;
}): () => void {
  const onCancelRef = useLatestRef(onCancel);
  return useCallback(() => {
    const view = viewRef.current;
    if (view) replaceDocument(view, '');
    resetHistoryState({ currentDraft, historyIndex });
    onCancelRef.current();
  }, [currentDraft, historyIndex, onCancelRef, viewRef]);
}

export function useHistoryNavigation({
  currentDraft,
  historyIndex,
  historyItems,
  viewRef,
}: HistoryRefs & { viewRef: ViewRef }): (direction: HistoryDirection) => void {
  return useCallback(
    (direction: HistoryDirection) => {
      const view = viewRef.current;
      if (!view || historyItems.current.length === 0) return;
      if (direction === 'up' && historyIndex.current === -1)
        currentDraft.current = view.state.doc.toString();
      const nextIndex = getNextHistoryIndex(
        direction,
        historyIndex.current,
        historyItems.current.length,
      );
      if (nextIndex === null) return;
      historyIndex.current = nextIndex;
      replaceDocument(
        view,
        nextIndex === -1 ? currentDraft.current : historyItems.current[nextIndex],
      );
    },
    [currentDraft, historyIndex, historyItems, viewRef],
  );
}

function runEditorAction(action: () => void): boolean {
  action();
  return true;
}

function createRichInputKeymap(
  doSubmit: () => void,
  doCancel: () => void,
  navigateHistory: (direction: HistoryDirection) => void,
) {
  return keymap.of([
    { key: 'Ctrl-Enter', run: () => runEditorAction(doSubmit) },
    { key: 'Shift-Enter', run: () => runEditorAction(doSubmit) },
    { key: 'Escape', run: () => runEditorAction(doCancel) },
    { key: 'Ctrl-ArrowUp', run: () => runEditorAction(() => navigateHistory('up')) },
    { key: 'Ctrl-ArrowDown', run: () => runEditorAction(() => navigateHistory('down')) },
  ]);
}

function createEditorExtensions(
  keyBinding: ReturnType<typeof createRichInputKeymap>,
  highlightCompartment: Compartment,
  lineNumCompartment: Compartment,
) {
  return [
    Prec.highest(keyBinding),
    lineNumCompartment.of([]),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightCompartment.of(richInputHighlightExtension),
    shellLanguage,
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    richInputEditorTheme,
    cmPlaceholder('Type a command... (Ctrl+Enter to submit, Esc to cancel)'),
  ];
}

export function createEditorView({
  doCancel,
  doSubmit,
  highlightCompartment,
  lineNumCompartment,
  navigateHistory,
  parent,
}: {
  doCancel: () => void;
  doSubmit: () => void;
  highlightCompartment: Compartment;
  lineNumCompartment: Compartment;
  navigateHistory: (direction: HistoryDirection) => void;
  parent: HTMLDivElement;
}): EditorView {
  const keyBinding = createRichInputKeymap(doSubmit, doCancel, navigateHistory);
  const extensions = createEditorExtensions(keyBinding, highlightCompartment, lineNumCompartment);
  return new EditorView({ state: EditorState.create({ doc: '', extensions }), parent });
}

export type EditorMountOptions = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  doCancel: () => void;
  doSubmit: () => void;
  highlightCompartment: CompartmentRef;
  lineNumCompartment: CompartmentRef;
  navigateHistory: (direction: HistoryDirection) => void;
  viewRef: ViewRef;
};

export function useRichInputEditorMount({
  containerRef,
  doCancel,
  doSubmit,
  highlightCompartment,
  lineNumCompartment,
  navigateHistory,
  viewRef,
}: EditorMountOptions): void {
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    viewRef.current = createEditorView({
      doCancel,
      doSubmit,
      highlightCompartment: highlightCompartment.current,
      lineNumCompartment: lineNumCompartment.current,
      navigateHistory,
      parent,
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [
    containerRef,
    doCancel,
    doSubmit,
    highlightCompartment,
    lineNumCompartment,
    navigateHistory,
    viewRef,
  ]);
}

export function useVisibleFocus(viewRef: ViewRef, visible: boolean): void {
  useEffect(() => {
    if (!visible || !viewRef.current) return;
    // Double-rAF to ensure CodeMirror DOM is fully ready (same pattern as xterm)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewRef.current?.focus();
      });
    });
    // Fallback in case rAFs don't fire (e.g. tab not visible)
    const timer = setTimeout(() => {
      viewRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [viewRef, visible]);
}

export function useLineNumberConfig(
  lineNumCompartment: CompartmentRef,
  showLineNumbers: boolean,
  viewRef: ViewRef,
): void {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumCompartment.current.reconfigure(showLineNumbers ? lineNumbers() : []),
    });
  }, [lineNumCompartment, showLineNumbers, viewRef]);
}

export function useRichInputEditorState(
  onSubmit: (text: string) => void,
  onCancel: () => void,
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewRef: ViewRef;
  highlightCompartment: CompartmentRef;
  lineNumCompartment: CompartmentRef;
  showLineNumbers: boolean;
  setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
  doSubmit: () => void;
  doCancel: () => void;
  navigateHistory: (direction: HistoryDirection) => void;
} {
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
  const navigateHistory = useHistoryNavigation({
    currentDraft,
    historyIndex,
    historyItems,
    viewRef,
  });
  return {
    containerRef,
    viewRef,
    highlightCompartment,
    lineNumCompartment,
    showLineNumbers,
    setShowLineNumbers,
    doSubmit,
    doCancel,
    navigateHistory,
  };
}
