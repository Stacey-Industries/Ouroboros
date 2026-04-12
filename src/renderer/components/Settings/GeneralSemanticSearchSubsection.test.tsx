import { describe, expect, it } from 'vitest';

import { SemanticSearchSubsection } from './GeneralSemanticSearchSubsection';

describe('GeneralSemanticSearchSubsection', () => {
  it('exports the component', () => {
    expect(typeof SemanticSearchSubsection).toBe('function');
  });
});
