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
