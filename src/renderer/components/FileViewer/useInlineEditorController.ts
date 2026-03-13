import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { LspDiagnostic } from '../../types/electron';
import { registerEditor, unregisterEditor } from './editorRegistry';
import {
  createEditorExtensions,
  createHighlightExtension,
  createLanguageExtensions,
  createLspCompletionSource,
  createLspHoverTooltipSource,
  createLspLinter,
  createSaveKeymap,
  createUpdateListener,
  getLanguageExtension,
  hasLspApi,
  normalizeFilePath,
} from './InlineEditor.cm';
import type { InlineEditorProps } from './InlineEditor';

interface EditorSetup {
  saveKeymap: Extension;
  updateListener: Extension;
  lspCompletionSource: ReturnType<typeof createLspCompletionSource>;
  lspHoverTooltipSource: Extension;
  lspLinter: Extension;
}

interface InlineEditorRuntime {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  viewRef: MutableRefObject<EditorView | null>;
  languageCompartment: MutableRefObject<Compartment>;
  highlightCompartment: MutableRefObject<Compartment>;
  lspCompartment: MutableRefObject<Compartment>;
  initialContentRef: MutableRefObject<string>;
  initialFilePathRef: MutableRefObject<string>;
  initialThemeIdRef: MutableRefObject<string>;
  onSaveRef: MutableRefObject<(content: string) => void>;
  onDirtyChangeRef: MutableRefObject<(dirty: boolean) => void>;
  filePathRef: MutableRefObject<string>;
  projectRootRef: MutableRefObject<string | null | undefined>;
  isDirtyRef: MutableRefObject<boolean>;
  didChangeTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  diagnosticsRef: MutableRefObject<LspDiagnostic[]>;
  setup: EditorSetup;
}

export function useInlineEditorController(props: InlineEditorProps) {
  const runtime = useInlineEditorRuntime(props);

  useEditorMount(runtime);
  useEditorLspLifecycle(runtime, props.content, props.filePath, props.projectRoot);
  useEditorThemeSync(runtime.viewRef, runtime.highlightCompartment, props.themeId);
  useEditorDocumentSync(runtime, props.content, props.filePath);

  return { containerRef: runtime.containerRef, viewRef: runtime.viewRef };
}

function useInlineEditorRuntime(props: InlineEditorProps): InlineEditorRuntime {
  const runtime = {
    containerRef: useRef<HTMLDivElement>(null),
    viewRef: useRef<EditorView | null>(null),
    languageCompartment: useRef(new Compartment()),
    highlightCompartment: useRef(new Compartment()),
    lspCompartment: useRef(new Compartment()),
    initialContentRef: useRef(props.content),
    initialFilePathRef: useRef(props.filePath),
    initialThemeIdRef: useRef(props.themeId),
    onSaveRef: useRef(props.onSave),
    onDirtyChangeRef: useRef(props.onDirtyChange),
    filePathRef: useRef(props.filePath),
    projectRootRef: useRef(props.projectRoot),
    isDirtyRef: useRef(false),
    didChangeTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
    diagnosticsRef: useRef<LspDiagnostic[]>([]),
  };
  const setupRef = useRef<EditorSetup | null>(null);

  syncRuntimeRefs(runtime, props);
  setupRef.current ??= createEditorSetup({ runtime });

  return { ...runtime, setup: setupRef.current };
}

function syncRuntimeRefs(
  runtime: Omit<InlineEditorRuntime, 'setup'>,
  props: InlineEditorProps
): void {
  runtime.onSaveRef.current = props.onSave;
  runtime.onDirtyChangeRef.current = props.onDirtyChange;
  runtime.filePathRef.current = props.filePath;
  runtime.projectRootRef.current = props.projectRoot;
}

function createEditorSetup({ runtime }: { runtime: Omit<InlineEditorRuntime, 'setup'> }): EditorSetup {
  return {
    saveKeymap: createSaveKeymap(runtime.onSaveRef),
    updateListener: createUpdateListener({
      initialContentRef: runtime.initialContentRef,
      isDirtyRef: runtime.isDirtyRef,
      onDirtyChangeRef: runtime.onDirtyChangeRef,
      didChangeTimerRef: runtime.didChangeTimerRef,
      projectRootRef: runtime.projectRootRef,
      filePathRef: runtime.filePathRef,
    }),
    lspCompletionSource: createLspCompletionSource(runtime.filePathRef, runtime.projectRootRef),
    lspHoverTooltipSource: createLspHoverTooltipSource(runtime.filePathRef, runtime.projectRootRef),
    lspLinter: createLspLinter(runtime.diagnosticsRef),
  };
}

function useEditorMount(runtime: InlineEditorRuntime): void {
  const { containerRef, viewRef, languageCompartment, highlightCompartment, lspCompartment, initialContentRef, initialFilePathRef, initialThemeIdRef, didChangeTimerRef, setup } = runtime;

  useEffect(() => {
    if (!containerRef.current) return;

    const mountedFilePath = initialFilePathRef.current;
    const view = createMountedEditorView({
      initialContentRef,
      initialThemeIdRef,
      languageCompartment,
      highlightCompartment,
      lspCompartment,
      setup,
      mountedFilePath,
      parent: containerRef.current,
    });

    viewRef.current = view;
    registerEditor(mountedFilePath, view);

    return () => {
      unregisterEditor(mountedFilePath);
      clearPendingDidChange(didChangeTimerRef);
      view.destroy();
      viewRef.current = null;
    };
  }, [
    containerRef,
    didChangeTimerRef,
    highlightCompartment,
    initialContentRef,
    initialFilePathRef,
    initialThemeIdRef,
    languageCompartment,
    lspCompartment,
    setup,
    viewRef,
  ]);
}

function createMountedEditorView(
  input: {
    initialContentRef: MutableRefObject<string>;
    initialThemeIdRef: MutableRefObject<string>;
    languageCompartment: MutableRefObject<Compartment>;
    highlightCompartment: MutableRefObject<Compartment>;
    lspCompartment: MutableRefObject<Compartment>;
    setup: EditorSetup;
    mountedFilePath: string;
    parent: HTMLDivElement;
  }
): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: input.initialContentRef.current,
      extensions: createEditorExtensions({
        filePath: input.mountedFilePath,
        themeId: input.initialThemeIdRef.current,
        languageCompartment: input.languageCompartment.current,
        highlightCompartment: input.highlightCompartment.current,
        lspCompartment: input.lspCompartment.current,
        languageExtension: getLanguageExtension(input.mountedFilePath),
        saveKeymap: input.setup.saveKeymap,
        updateListener: input.setup.updateListener,
        lspCompletionSource: input.setup.lspCompletionSource,
        lspHoverTooltipSource: input.setup.lspHoverTooltipSource,
        lspLinter: input.setup.lspLinter,
      }),
    }),
    parent: input.parent,
  });
}

function useEditorLspLifecycle(
  runtime: InlineEditorRuntime,
  content: string,
  filePath: string,
  projectRoot: string | null | undefined
): void {
  const { diagnosticsRef, filePathRef, projectRootRef, viewRef } = runtime;

  useEffect(() => {
    const root = projectRoot ?? projectRootRef.current;
    const currentFilePath = filePath || filePathRef.current;
    if (!root || !currentFilePath || !hasLspApi()) return;

    const currentContent = viewRef.current?.state.doc.toString() ?? content;
    window.electronAPI.lsp.didOpen(root, currentFilePath, currentContent).catch(() => {});
    const cleanupDiagnostics = window.electronAPI.lsp.onDiagnostics((event) => {
      if (normalizeFilePath(event.filePath) !== normalizeFilePath(currentFilePath)) return;
      diagnosticsRef.current = event.diagnostics;
      if (!viewRef.current) return;
      requestAnimationFrame(() => viewRef.current?.dispatch({}));
    });

    return () => {
      closeLspDocument(root, currentFilePath);
      cleanupDiagnostics();
      diagnosticsRef.current = [];
    };
  }, [content, diagnosticsRef, filePath, filePathRef, projectRoot, projectRootRef, viewRef]);
}

function closeLspDocument(root: string, filePath: string): void {
  if (hasLspApi()) {
    window.electronAPI.lsp.didClose(root, filePath).catch(() => {});
  }
}

function useEditorThemeSync(
  viewRef: MutableRefObject<EditorView | null>,
  highlightCompartment: MutableRefObject<Compartment>,
  themeId: string
): void {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: highlightCompartment.current.reconfigure(createHighlightExtension(themeId)),
    });
  }, [highlightCompartment, themeId, viewRef]);
}

function useEditorDocumentSync(
  runtime: InlineEditorRuntime,
  content: string,
  filePath: string
): void {
  const {
    viewRef,
    initialContentRef,
    isDirtyRef,
    onDirtyChangeRef,
    languageCompartment,
  } = runtime;

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    initialContentRef.current = content;
    isDirtyRef.current = false;
    onDirtyChangeRef.current(false);

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    view.dispatch({
      effects: languageCompartment.current.reconfigure(
        createLanguageExtensions(getLanguageExtension(filePath))
      ),
    });
  }, [content, filePath, initialContentRef, isDirtyRef, languageCompartment, onDirtyChangeRef, viewRef]);
}

function clearPendingDidChange(
  didChangeTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
): void {
  const timer = didChangeTimerRef.current;
  if (timer) clearTimeout(timer);
}
