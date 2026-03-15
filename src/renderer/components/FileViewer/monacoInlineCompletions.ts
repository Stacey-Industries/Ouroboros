/**
 * Monaco Inline Completions — scaffold for AI-powered ghost text suggestions.
 *
 * Registers an InlineCompletionsProvider that returns empty completions for now.
 * This is the foundation for future Claude API integration via IPC.
 *
 * Usage:
 *   import { registerInlineCompletionProvider } from './monacoInlineCompletions';
 *   const disposable = registerInlineCompletionProvider();
 *   // later: disposable.dispose();
 */
import * as monaco from 'monaco-editor';

/**
 * Inline completions provider that will eventually send context to Claude API.
 *
 * TODO: Implementation plan:
 *   - Send surrounding context to Claude API via IPC (`ai:inline-completion`)
 *   - Context to include:
 *     - Current file content (500 lines before cursor, 100 lines after)
 *     - Open file tabs (names + first 50 lines each)
 *     - Recent edits in other files
 *     - Project context from context layer
 *   - Debounce 500ms after last keystroke before requesting
 *   - Cancel stale requests using the CancellationToken
 *   - Don't show when autocomplete dropdown is visible (check context.selectedSuggestionInfo)
 *   - Rate-limit requests to avoid overwhelming the API
 *   - Silently fail on network errors (no error UI for ghost text)
 *   - Only provide completions for the primary cursor (not multi-cursor)
 */
const inlineCompletionsProvider: monaco.languages.InlineCompletionsProvider = {
  provideInlineCompletions(
    _model: monaco.editor.ITextModel,
    _position: monaco.Position,
    _context: monaco.languages.InlineCompletionContext,
    _token: monaco.CancellationToken,
  ): monaco.languages.ProviderResult<monaco.languages.InlineCompletions> {
    // TODO: Implement AI-powered completions here.
    // For now, return an empty list so the provider is registered
    // but doesn't interfere with the editing experience.
    return { items: [] };
  },

  freeInlineCompletions(_completions: monaco.languages.InlineCompletions): void {
    // TODO: Clean up any resources associated with the completions
    // (e.g., cancel pending API requests, release memory)
  },
};

let registration: monaco.IDisposable | null = null;

/**
 * Register the inline completion provider for all languages.
 * Safe to call multiple times — subsequent calls return the existing registration.
 *
 * @returns A disposable that unregisters the provider when disposed.
 */
export function registerInlineCompletionProvider(): monaco.IDisposable {
  if (registration) return registration;

  registration = monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**' },
    inlineCompletionsProvider,
  );

  // Wrap so we can clear our reference on dispose
  const originalDispose = registration.dispose.bind(registration);
  registration.dispose = () => {
    originalDispose();
    registration = null;
  };

  return registration;
}
