// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// Mock monaco-editor — its clipboard module calls document.queryCommandSupported
// at load time, which jsdom does not implement. vi.mock is hoisted before imports.
vi.mock('monaco-editor', () => ({
  editor: {
    setTheme: vi.fn(),
    defineTheme: vi.fn(),
    create: vi.fn(),
    createModel: vi.fn(),
    getModel: vi.fn(),
    setModelMarkers: vi.fn(),
  },
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerInlineCompletionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerReferenceProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerSignatureHelpProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDocumentFormattingEditProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerCodeActionProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerRenameProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDocumentHighlightProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerFoldingRangeProvider: vi.fn(() => ({ dispose: vi.fn() })),
    CompletionItemKind: {
      Method: 0, Function: 1, Constructor: 2, Field: 3, Variable: 4, Class: 5,
      Interface: 6, Module: 7, Property: 8, Unit: 9, Value: 10, Enum: 11,
      Keyword: 12, Snippet: 13, Color: 14, File: 15, Reference: 16, Folder: 17,
    },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  },
  Range: class { constructor(public startLine: number, public startCol: number, public endLine: number, public endCol: number) {} },
  Position: class { constructor(public lineNumber: number, public column: number) {} },
  Uri: { parse: (s: string) => s, file: (s: string) => s },
  KeyMod: {},
  KeyCode: {},
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
}));

import { disposeMonacoModel,MonacoEditor } from './MonacoEditor';

describe('MonacoEditor', () => {
  it('exports MonacoEditor as a memoized component', () => {
    expect(typeof MonacoEditor).toBe('object');
  });

  it('exports disposeMonacoModel as a function', () => {
    expect(typeof disposeMonacoModel).toBe('function');
  });
});
