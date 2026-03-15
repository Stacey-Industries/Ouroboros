/**
 * editorStateStore.ts — Persists per-file editor state (scroll position, cursor,
 * folded ranges) to localStorage with LRU eviction.
 *
 * Storage key format: `editor-state:${filePath}`
 * Global index key: `editor-state:__index__`
 * Max entries: 100 (least-recently-used entries are evicted on save).
 */

const STORAGE_PREFIX = 'editor-state:';
const INDEX_KEY = 'editor-state:__index__';
const MAX_ENTRIES = 100;

export interface EditorStateSnapshot {
  scrollTop: number;
  scrollLeft: number;
  cursorLine: number;
  cursorColumn: number;
  foldedRanges?: Array<{ startLine: number; endLine: number }>;
}

/**
 * Load the LRU index — an ordered list of file paths (most-recently-used last).
 */
function loadIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist the LRU index.
 */
function saveIndex(index: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

/**
 * Touch a file path in the LRU index, moving it to the end (most-recently-used).
 * Evicts oldest entries if over MAX_ENTRIES.
 */
function touchIndex(filePath: string): void {
  const index = loadIndex().filter((p) => p !== filePath);
  index.push(filePath);

  // Evict oldest entries
  while (index.length > MAX_ENTRIES) {
    const evicted = index.shift();
    if (evicted) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + evicted);
      } catch {
        // ignore
      }
    }
  }

  saveIndex(index);
}

/**
 * Remove a file path from the LRU index.
 */
function removeFromIndex(filePath: string): void {
  const index = loadIndex().filter((p) => p !== filePath);
  saveIndex(index);
}

/**
 * Save editor state for a file. This is designed to be called synchronously
 * (localStorage is synchronous) so it won't slow down file switching.
 */
export function saveEditorState(filePath: string, state: EditorStateSnapshot): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + filePath, JSON.stringify(state));
    touchIndex(filePath);
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

/**
 * Load saved editor state for a file. Returns null if no state is saved.
 */
export function loadEditorState(filePath: string): EditorStateSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + filePath);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorStateSnapshot;
    // Validate minimum required fields
    if (
      typeof parsed.scrollTop !== 'number' ||
      typeof parsed.scrollLeft !== 'number' ||
      typeof parsed.cursorLine !== 'number' ||
      typeof parsed.cursorColumn !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Remove saved editor state for a file.
 */
export function clearEditorState(filePath: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + filePath);
    removeFromIndex(filePath);
  } catch {
    // ignore
  }
}
