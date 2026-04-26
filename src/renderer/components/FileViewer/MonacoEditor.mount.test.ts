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

import type { RuntimeInput } from './MonacoEditor.mount';
import { mountMonacoEditor } from './MonacoEditor.mount';

describe('MonacoEditor.mount', () => {
  it('exports mountMonacoEditor as a function', () => {
    expect(typeof mountMonacoEditor).toBe('function');
  });

  it('RuntimeInput type is defined (compile-time check)', () => {
    const shape: Partial<RuntimeInput> = {};
    expect(shape).toBeDefined();
  });
});
