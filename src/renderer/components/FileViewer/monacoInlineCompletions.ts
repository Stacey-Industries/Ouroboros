/**
 * Monaco Inline Completions — AI-powered ghost text suggestions.
 *
 * Calls `window.electronAPI.ai.inlineCompletion` with surrounding code
 * context. Debounces 500ms, cancels stale requests, respects the
 * `inlineCompletionsEnabled` config toggle.
 */
import * as monaco from 'monaco-editor';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;

function hasAiApi(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.ai;
}

function extractContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): { before: string; after: string } {
  const startLine = Math.max(1, position.lineNumber - 500);
  const endLine = Math.min(model.getLineCount(), position.lineNumber + 100);
  return {
    before: model.getValueInRange(new monaco.Range(startLine, 1, position.lineNumber, position.column)),
    after: model.getValueInRange(new monaco.Range(position.lineNumber, position.column, endLine, model.getLineMaxColumn(endLine))),
  };
}

function clearDebounce(): void {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
}

function debounce(ms: number, token: monaco.CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    clearDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (token.isCancellationRequested) reject(new Error('cancelled'));
      else resolve();
    }, ms);
    token.onCancellationRequested(() => { clearDebounce(); reject(new Error('cancelled')); });
  });
}

const EMPTY: monaco.languages.InlineCompletions = { items: [] };

function makeResult(
  completion: string,
  position: monaco.Position,
): monaco.languages.InlineCompletions {
  const range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
  return { items: [{ insertText: completion, range }] };
}

async function fetchCompletion(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  id: number,
  token: monaco.CancellationToken,
): Promise<monaco.languages.InlineCompletions> {
  const { before, after } = extractContext(model, position);
  if (!before.trim() && !after.trim()) return EMPTY;

  const result = await window.electronAPI.ai.inlineCompletion({
    filePath: model.uri.path,
    languageId: model.getLanguageId(),
    textBeforeCursor: before,
    textAfterCursor: after,
  });

  if (token.isCancellationRequested || id !== requestId) return EMPTY;
  if (!result.success || !result.completion) return EMPTY;
  return makeResult(result.completion, position);
}

const provider: monaco.languages.InlineCompletionsProvider = {
  async provideInlineCompletions(
    model, position, context, token,
  ): Promise<monaco.languages.InlineCompletions> {
    if (!hasAiApi() || context.selectedSuggestionInfo) return EMPTY;

    const id = ++requestId;
    try { await debounce(500, token); } catch { return EMPTY; }
    if (token.isCancellationRequested || id !== requestId) return EMPTY;

    try { return await fetchCompletion(model, position, id, token); } catch { return EMPTY; }
  },

  disposeInlineCompletions(): void { clearDebounce(); },
};

let registration: monaco.IDisposable | null = null;

export function registerInlineCompletionProvider(): monaco.IDisposable {
  if (registration) return registration;
  registration = monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, provider);
  const orig = registration.dispose.bind(registration);
  registration.dispose = () => { orig(); registration = null; };
  return registration;
}
