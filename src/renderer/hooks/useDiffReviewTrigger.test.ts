/**
 * Unit smoke tests for useDiffReviewTrigger.
 *
 * The full behavioural contract (all 5 acceptance criteria) is covered by the
 * orchestrator-owned acceptance test at useDiffReviewTrigger.acceptance.test.tsx.
 * This file satisfies the post-write hook's co-located-test requirement and adds
 * one structural check: the export exists and is a function.
 */
import { describe, expect, it } from 'vitest';

import { useDiffReviewTrigger } from './useDiffReviewTrigger';

describe('useDiffReviewTrigger — module shape', () => {
  it('exports useDiffReviewTrigger as a function', () => {
    expect(typeof useDiffReviewTrigger).toBe('function');
  });
});
