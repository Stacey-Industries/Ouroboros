import { describe, expect, it } from 'vitest';

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
