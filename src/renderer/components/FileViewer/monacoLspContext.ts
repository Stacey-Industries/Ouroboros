/**
 * Shared mutable context for Monaco LSP providers.
 *
 * Monaco providers are registered globally (once per language selector), not
 * per-editor-instance. They need to know which file and project root are
 * currently active at invocation time. This module provides that via a
 * module-level mutable ref updated by the active MonacoEditor on mount/focus.
 */

interface LspContext {
  root: string | null;
  filePath: string | null;
}

const activeLspContext: LspContext = { root: null, filePath: null };

export function setActiveLspContext(
  root: string | null,
  filePath: string | null,
): void {
  activeLspContext.root = root;
  activeLspContext.filePath = filePath;
}

export function getActiveLspContext(): {
  root: string;
  filePath: string;
} | null {
  if (!activeLspContext.root || !activeLspContext.filePath) return null;
  return {
    root: activeLspContext.root,
    filePath: activeLspContext.filePath,
  };
}
