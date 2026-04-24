import { describe, expect, it } from 'vitest';

import { disposeMonacoModel,MonacoEditor } from './MonacoEditor';

describe('MonacoEditor', () => {
  it('exports MonacoEditor as a memoized component', () => {
    expect(typeof MonacoEditor).toBe('object');
  });

  it('exports disposeMonacoModel as a function', () => {
    expect(typeof disposeMonacoModel).toBe('function');
  });
});
