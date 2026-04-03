/**
 * useMonacoBlame — applies git blame decorations to a Monaco editor instance.
 *
 * When `enabled` is true, fetches blame data via useGitBlame and renders
 * inline annotations (GitLens-style) at the end of each group-start line.
 */
import * as monaco from 'monaco-editor';
import { type MutableRefObject, useEffect, useRef } from 'react';

import { useGitBlame } from '../../hooks/useGitBlame';
import { blameDecorationsToMonaco, blameLinesToDecorations } from './monacoBlame';

export function useMonacoBlame(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  filePath: string,
  projectRoot: string | null | undefined,
  enabled: boolean,
): void {
  const { blameLines } = useGitBlame(projectRoot ?? null, filePath, enabled);
  const decorationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || blameLines.length === 0) {
      clearDecorations(editorRef, decorationIdsRef);
      return;
    }
    const decs = blameLinesToDecorations(blameLines);
    const monacoDecs = blameDecorationsToMonaco(decs);
    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      monacoDecs,
    );
  }, [editorRef, enabled, blameLines]);

  // Clear on unmount or disable.
  useEffect(() => {
    if (enabled) return;
    clearDecorations(editorRef, decorationIdsRef);
  }, [enabled, editorRef]);
}

function clearDecorations(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  idsRef: MutableRefObject<string[]>,
): void {
  if (idsRef.current.length === 0) return;
  const editor = editorRef.current;
  if (editor) idsRef.current = editor.deltaDecorations(idsRef.current, []);
  else idsRef.current = [];
}
