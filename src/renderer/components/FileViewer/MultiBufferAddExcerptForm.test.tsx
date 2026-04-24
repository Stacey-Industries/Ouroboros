import { describe, expect, it } from 'vitest';

import { AddExcerptForm } from './MultiBufferAddExcerptForm';

describe('MultiBufferAddExcerptForm', () => {
  it('exports AddExcerptForm as a memoized component', () => {
    expect(typeof AddExcerptForm).toBe('object');
  });
});
