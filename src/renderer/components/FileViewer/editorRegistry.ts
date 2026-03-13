/**
 * editorRegistry.ts — Global registry of active CodeMirror EditorView instances.
 *
 * InlineEditor registers its EditorView here on mount and unregisters on unmount.
 * This allows other parts of the app (e.g. useIdeToolResponder) to read editor
 * content and selection state without threading refs through the component tree.
 */

import type { EditorView } from '@codemirror/view'

/** Map of filePath -> EditorView instance */
const registry = new Map<string, EditorView>()

export function registerEditor(filePath: string, view: EditorView): void {
  registry.set(filePath, view)
}

export function unregisterEditor(filePath: string): void {
  registry.delete(filePath)
}

/**
 * Get the current document content for a file path.
 * Returns null if the file is not open in an editor.
 */
export function getEditorContent(filePath?: string): string | null {
  let view: EditorView | undefined

  if (filePath) {
    view = registry.get(filePath)
  } else {
    const first = registry.values().next()
    view = first.done ? undefined : first.value
  }

  if (!view) return null
  return view.state.doc.toString()
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
    const view = registry.get(filePath)
    if (!view) return null
    return extractSelection(view, filePath)
  }

  // Search all editors for a non-empty selection
  for (const [path, view] of registry) {
    const sel = extractSelection(view, path)
    if (sel) return sel
  }

  return null
}

function extractSelection(
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
