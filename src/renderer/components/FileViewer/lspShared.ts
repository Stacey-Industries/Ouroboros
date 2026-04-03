/**
 * Shared LSP utilities used by both the Monaco and CodeMirror editor paths.
 */

export function hasLspApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    'electronAPI' in window &&
    !!window.electronAPI?.lsp
  );
}

export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}
