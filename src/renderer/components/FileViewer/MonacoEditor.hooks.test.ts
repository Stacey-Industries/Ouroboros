// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// Mock monaco-editor — its clipboard module calls document.queryCommandSupported
// at load time, which jsdom does not implement. vi.mock is hoisted before imports.
vi.mock('monaco-editor', () => ({
  editor: { setTheme: vi.fn(), defineTheme: vi.fn(), create: vi.fn(), createModel: vi.fn() },
  Range: class {},
  Uri: { parse: (s: string) => s },
  KeyMod: {},
  KeyCode: {},
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
}));

import {
  useMonacoEditorContentSync,
  useMonacoEditorDiffs,
  useMonacoEditorFontFamily,
  useMonacoEditorModes,
  useMonacoEditorMount,
  useMonacoEditorOptions,
  useMonacoEditorRuntime,
} from './MonacoEditor.hooks';

describe('MonacoEditor.hooks', () => {
  it('exports all hooks as functions', () => {
    expect(typeof useMonacoEditorMount).toBe('function');
    expect(typeof useMonacoEditorContentSync).toBe('function');
    expect(typeof useMonacoEditorFontFamily).toBe('function');
    expect(typeof useMonacoEditorOptions).toBe('function');
    expect(typeof useMonacoEditorModes).toBe('function');
    expect(typeof useMonacoEditorDiffs).toBe('function');
    expect(typeof useMonacoEditorRuntime).toBe('function');
  });
});
