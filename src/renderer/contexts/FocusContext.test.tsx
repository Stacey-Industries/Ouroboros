import { describe, expect, it } from 'vitest';

import { focusRingStyle } from './FocusContext';

describe('focusRingStyle', () => {
  it('returns empty object when panel is not focused', () => {
    expect(focusRingStyle('sidebar', 'editor')).toEqual({});
  });

  it('returns box-shadow when panel matches focused', () => {
    const style = focusRingStyle('editor', 'editor');
    expect(style).toHaveProperty('boxShadow');
    expect(style.boxShadow).toContain('var(--interactive-focus)');
  });

  it('returns empty for every non-matching combination', () => {
    expect(focusRingStyle('terminal', 'sidebar')).toEqual({});
    expect(focusRingStyle('agentMonitor', 'editor')).toEqual({});
  });
});
