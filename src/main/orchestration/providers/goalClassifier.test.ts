import { describe, expect, it } from 'vitest';

import { classifyGoal } from './goalClassifier';

describe('classifyGoal', () => {
  describe('casual goals', () => {
    it.each([
      'Hi',
      'hello',
      'hey there',
      'thanks!',
      'ok',
      'cool',
      'how are you',
      'good morning',
      "what's up",
      '',
      '   ',
    ])('classifies %j as casual', (goal) => {
      expect(classifyGoal(goal)).toBe('casual');
    });
  });

  describe('code goals', () => {
    it.each([
      'Fix the bug in src/main/orchestration/foo.ts',
      'Review this function in claudeCodeLaunch.ts',
      'Debug TypeError on line 42',
      'Refactor handleX to use options object',
      'Run npm run build',
      'why does this throw a ReferenceError',
      'implement export const handler = () => {}',
      'investigate the failing test in foo.test.ts',
      'audit the auth flow',
      'How does the goalClassifier work',
    ])('classifies %j as code', (goal) => {
      expect(classifyGoal(goal)).toBe('code');
    });
  });

  describe('code fences and identifiers', () => {
    it('classifies fenced code as code', () => {
      expect(classifyGoal('look at this:\n```ts\nconst x = 1\n```')).toBe('code');
    });
    it('classifies $-prefixed shell as code', () => {
      expect(classifyGoal('$ git status')).toBe('code');
    });
  });

  describe('inputs', () => {
    it('returns unknown for non-string', () => {
      expect(classifyGoal(undefined)).toBe('unknown');
      expect(classifyGoal(null)).toBe('unknown');
    });
    it('returns unknown for ambiguous medium-length prose', () => {
      const text =
        'The deployment situation has been a bit messy lately and we should probably figure something out soon';
      expect(classifyGoal(text)).toBe('unknown');
    });
  });
});
