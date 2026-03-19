/**
 * editorRegistry.ts — Global registry of active editor instances.
 *
 * Tracks both CodeMirror (EditorView) and Monaco (IStandaloneCodeEditor)
 * instances. Allows other parts of the app (e.g. useIdeToolResponder via
 * IdeToolBridge) to read editor content and selection state without threading
 * refs through the component tree.
 *
 * CodeMirror: InlineEditor registers on mount, unregisters on unmount.
 * Monaco: MonacoEditorHost registers on model swap, unregisters on model detach.
 */

import type { EditorView } from '@codemirror/view'
import type * as monaco from 'monaco-editor'

// ── CodeMirror registry ──────────────────────────────────────────────────────

/** Map of filePath -> CodeMirror EditorView instance */
const cmRegistry = new Map<string, EditorView>()

export function registerEditor(filePath: string, view: EditorView): void {
  cmRegistry.set(filePath, view)
}

export function unregisterEditor(filePath: string): void {
  cmRegistry.delete(filePath)
}

// ── Monaco registry ──────────────────────────────────────────────────────────

/** Map of filePath -> Monaco IStandaloneCodeEditor instance */
const monacoRegistry = new Map<string, monaco.editor.IStandaloneCodeEditor>()

export function registerMonacoEditor(
  filePath: string,
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  monacoRegistry.set(filePath, editor)
}

export function unregisterMonacoEditor(filePath: string): void {
  monacoRegistry.delete(filePath)
}

// ── Unified content access ───────────────────────────────────────────────────

/**
 * Get the current document content for a file path.
 * Checks CodeMirror registry first, then Monaco registry.
 * Returns null if the file is not open in any editor.
 */
export function getEditorContent(filePath?: string): string | null {
  // Try CodeMirror first
  if (filePath) {
    const cmView = cmRegistry.get(filePath)
    if (cmView) return cmView.state.doc.toString()

    const monacoEditor = monacoRegistry.get(filePath)
    if (monacoEditor) {
      const model = monacoEditor.getModel()
      return model ? model.getValue() : null
    }
    return null
  }

  // No filePath — return first available
  const firstCm = cmRegistry.values().next()
  if (!firstCm.done) return firstCm.value.state.doc.toString()

  const firstMonaco = monacoRegistry.values().next()
  if (!firstMonaco.done) {
    const model = firstMonaco.value.getModel()
    return model ? model.getValue() : null
  }

  return null
}

/**
 * Get the current selection from an editor.
 * If filePath is provided, reads from that editor; otherwise reads from
 * the first editor that has a non-empty selection.
 */
export function getEditorSelection(filePath?: string): {
  text: string
  filePath?: string
  startLine?: number
  endLine?: number
} | null {
  if (filePath) {
    // Try CodeMirror
    const cmView = cmRegistry.get(filePath)
    if (cmView) return extractCmSelection(cmView, filePath)

    // Try Monaco
    const monacoEditor = monacoRegistry.get(filePath)
    if (monacoEditor) return extractMonacoSelection(monacoEditor, filePath)

    return null
  }

  // Search all CodeMirror editors for a non-empty selection
  for (const [path, view] of cmRegistry) {
    const sel = extractCmSelection(view, path)
    if (sel) return sel
  }

  // Search all Monaco editors for a non-empty selection
  for (const [path, editor] of monacoRegistry) {
    const sel = extractMonacoSelection(editor, path)
    if (sel) return sel
  }

  return null
}

// ── CodeMirror selection extraction ──────────────────────────────────────────

function extractCmSelection(
  view: EditorView,
  filePath: string
): { text: string; filePath: string; startLine: number; endLine: number } | null {
  const { from, to } = view.state.selection.main
  if (from === to) return null

  const text = view.state.sliceDoc(from, to)
  const startLine = view.state.doc.lineAt(from).number
  const endLine = view.state.doc.lineAt(to).number

  return { text, filePath, startLine, endLine }
}

// ── Monaco selection extraction ──────────────────────────────────────────────

function extractMonacoSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  filePath: string
): { text: string; filePath: string; startLine: number; endLine: number } | null {
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) return null

  const model = editor.getModel()
  if (!model) return null

  const text = model.getValueInRange(selection)
  if (!text) return null

  return {
    text,
    filePath,
    startLine: selection.startLineNumber,
    endLine: selection.endLineNumber,
  }
}
