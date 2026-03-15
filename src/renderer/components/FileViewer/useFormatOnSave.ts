/**
 * useFormatOnSave — Hook that wraps the save action with optional formatting.
 *
 * Before saving, checks if formatting is available for the file's language.
 * If available and enabled, runs Monaco's built-in format action then saves.
 * If not available or disabled, saves directly.
 *
 * This is infrastructure-only — no LSP calls yet. Monaco's built-in formatting
 * (if any) will work. LSP formatting will plug in later via Monaco's
 * DocumentFormattingEditProvider.
 */
import { useCallback, useRef } from 'react';
import type * as monaco from 'monaco-editor';

export interface UseFormatOnSaveOptions {
  /** Whether format-on-save is enabled */
  formatOnSave: boolean;
  /** The save handler to call after formatting */
  onSave?: (content: string) => void;
}

/**
 * Returns a save handler that optionally formats the document first.
 * Pass this as the save action for the Monaco editor.
 */
export function useFormatOnSave(options: UseFormatOnSaveOptions): {
  /** Call this from the editor's save keybinding with the editor instance */
  handleSave: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  /** Ref to store the editor instance for external save triggers */
  editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
} {
  const { formatOnSave, onSave } = options;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleSave = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      if (!onSave) return;

      if (formatOnSave) {
        // Try to run Monaco's built-in format action
        const formatAction = editor.getAction('editor.action.formatDocument');
        if (formatAction) {
          formatAction
            .run()
            .then(() => {
              onSave(editor.getValue());
            })
            .catch(() => {
              // Formatting failed — save anyway
              onSave(editor.getValue());
            });
          return;
        }
      }

      // No formatting — save directly
      onSave(editor.getValue());
    },
    [formatOnSave, onSave],
  );

  return { handleSave, editorRef };
}
