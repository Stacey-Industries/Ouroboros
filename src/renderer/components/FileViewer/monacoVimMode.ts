/**
 * Monaco Vim/Emacs keybinding mode support.
 *
 * Uses the `monaco-vim` package for Vim keybindings with a mode indicator
 * status bar. Emacs is stubbed for future `monaco-emacs` integration.
 */
import * as monaco from 'monaco-editor';

// monaco-vim uses a default export
// eslint-disable-next-line @typescript-eslint/no-require-imports
let initVimMode: ((
  editor: monaco.editor.IStandaloneCodeEditor,
  statusBarNode: HTMLElement,
) => VimModeHandle) | null = null;

interface VimModeHandle {
  dispose: () => void;
}

// Dynamic import to avoid bundling monaco-vim when not used
let importAttempted = false;
let importFailed = false;

async function ensureVimImported(): Promise<boolean> {
  if (initVimMode) return true;
  if (importFailed) return false;
  if (importAttempted) return false;

  importAttempted = true;
  try {
    const mod = await import('monaco-vim');
    initVimMode = mod.initVimMode ?? mod.default?.initVimMode ?? mod.default;
    if (typeof initVimMode !== 'function') {
      console.warn('[monacoVimMode] monaco-vim loaded but initVimMode not found');
      importFailed = true;
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[monacoVimMode] Failed to load monaco-vim:', err);
    importFailed = true;
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Active vim mode instance
// ────────────────────────────────────────────────────────────────────────────

let activeVimHandle: VimModeHandle | null = null;

/**
 * Enable Vim keybindings on a Monaco editor instance.
 *
 * @param editor - The Monaco standalone code editor
 * @param statusBarElement - An HTMLElement where the Vim mode indicator
 *   (NORMAL / INSERT / VISUAL / COMMAND) will be rendered
 * @returns A dispose function that disables Vim mode, or null if monaco-vim
 *   is not available
 */
export async function enableVimMode(
  editor: monaco.editor.IStandaloneCodeEditor,
  statusBarElement: HTMLElement,
): Promise<(() => void) | null> {
  // Disable any existing vim mode first
  disableVimMode();

  const available = await ensureVimImported();
  if (!available || !initVimMode) {
    console.warn('[monacoVimMode] Vim mode not available — monaco-vim package not loaded');
    return null;
  }

  activeVimHandle = initVimMode(editor, statusBarElement);

  return () => {
    disableVimMode();
  };
}

/**
 * Disable Vim keybindings if currently active.
 */
export function disableVimMode(): void {
  if (activeVimHandle) {
    activeVimHandle.dispose();
    activeVimHandle = null;
  }
}

/**
 * Enable Emacs keybindings on a Monaco editor instance.
 *
 * Stub implementation — will use `monaco-emacs` package when available.
 *
 * @param _editor - The Monaco standalone code editor
 * @returns A dispose function, or null if not available
 */
export async function enableEmacsMode(
  _editor: monaco.editor.IStandaloneCodeEditor,
): Promise<(() => void) | null> {
  // TODO: Install and integrate `monaco-emacs` package
  // import { EmacsExtension } from 'monaco-emacs';
  // const ext = new EmacsExtension(editor);
  // ext.start();
  // return () => ext.dispose();
  console.warn(
    '[monacoVimMode] Emacs mode not yet implemented — install monaco-emacs package',
  );
  return null;
}

export type KeybindingMode = 'default' | 'vim' | 'emacs';
