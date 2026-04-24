import { describe, expect, it } from 'vitest';

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
