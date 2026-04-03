/**
 * monacoEditorRefs — stable React refs + action binders for MonacoEditor.
 */
import * as monaco from 'monaco-editor';
import type { MutableRefObject } from 'react';
import { useRef } from 'react';

export interface EditorRefs {
  containerRef: React.RefObject<HTMLDivElement>;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  vimStatusRef: React.RefObject<HTMLDivElement>;
  vimDisposeRef: MutableRefObject<(() => void) | null>;
  isDirtyRef: MutableRefObject<boolean>;
  contentChangeDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  saveActionDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  diffDecorationIdsRef: MutableRefObject<string[]>;
}

export function useEditorRefs(): EditorRefs {
  return {
    containerRef: useRef<HTMLDivElement>(null),
    editorRef: useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    vimStatusRef: useRef<HTMLDivElement>(null),
    vimDisposeRef: useRef<(() => void) | null>(null),
    isDirtyRef: useRef(false),
    contentChangeDisposableRef: useRef<monaco.IDisposable | null>(null),
    saveActionDisposableRef: useRef<monaco.IDisposable | null>(null),
    inlineEditDisposableRef: useRef<monaco.IDisposable | null>(null),
    diffDecorationIdsRef: useRef<string[]>([]),
  };
}

export function bindInlineEditAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  activateRef: MutableRefObject<() => void>,
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>,
): void {
  inlineEditDisposableRef.current = editor.addAction({
    id: 'ouroboros-inline-edit',
    label: 'Inline Edit',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
    run: () => { activateRef.current(); },
  });
}
