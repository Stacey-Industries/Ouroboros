/**
 * WebFolderBrowserSupport.ts — Event-based promise bridge for web folder selection.
 *
 * In desktop mode, `files.selectFolder()` opens a native OS dialog.
 * In web mode, this module provides an equivalent that shows a React modal.
 *
 * Usage:
 *   const result = await requestFolderSelection();
 *   if (!result.cancelled) { ... result.path ... }
 */

// ─── Event Name Constants ──────────────────────────────────────────────────

export const REQUEST_FOLDER_SELECTION_EVENT = 'agent-ide:request-folder-selection';
export const RESOLVE_FOLDER_SELECTION_EVENT = 'agent-ide:resolve-folder-selection';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FolderSelectionResult {
  cancelled: boolean;
  path: string | null;
}

export interface FolderSelectionResolveDetail {
  result: FolderSelectionResult;
}

// ─── Promise Bridge ────────────────────────────────────────────────────────

let pendingResolve: ((result: FolderSelectionResult) => void) | null = null;

/**
 * Dispatches a DOM event to show the web folder browser modal.
 * Returns a promise that resolves when the user picks a folder or cancels.
 * Only one selection dialog can be open at a time — concurrent calls share the same promise.
 */
export function requestFolderSelection(): Promise<FolderSelectionResult> {
  if (pendingResolve !== null) {
    // A dialog is already open; return a new promise that piggybacks the same resolve.
    return new Promise<FolderSelectionResult>((resolve) => {
      const prev = pendingResolve;
      pendingResolve = (result) => {
        prev?.(result);
        resolve(result);
      };
    });
  }

  return new Promise<FolderSelectionResult>((resolve) => {
    pendingResolve = resolve;
    window.dispatchEvent(new CustomEvent(REQUEST_FOLDER_SELECTION_EVENT));
  });
}

/**
 * Called by the modal component when the user picks a folder or cancels.
 * Resolves the pending promise and clears the bridge state.
 */
export function resolveFolderSelection(result: FolderSelectionResult): void {
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(result);
}
