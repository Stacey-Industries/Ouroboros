import { describe, expect, it } from 'vitest';

import { routeByRules } from './ruleEngine';

describe('ruleEngine', () => {
  describe('slash command overrides', () => {
    it('routes /user:review to OPUS', () => {
      const r = routeByRules('/user:review the authentication module');
      expect(r).toMatchObject({ tier: 'OPUS', rule: 'CMD', confidence: 'HIGH' });
    });

    it('routes /user:explain to HAIKU', () => {
      const r = routeByRules('/user:explain what this function does');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'CMD' });
    });

    it('routes /user:build to SONNET', () => {
      const r = routeByRules('/user:build the new dashboard component');
      expect(r).toMatchObject({ tier: 'SONNET', rule: 'CMD' });
    });
  });

  describe('H1 — answering assistant question', () => {
    it('matches short answer when assistant ended with ?', () => {
      const r = routeByRules('Private, and Ouroboros', 'Repo name? Visibility — public or private?');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H1' });
    });

    it('"yes" without context still routes HAIKU via H4 (confirmation)', () => {
      const r = routeByRules('yes');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H4' });
    });

    it('non-confirmation answer needs assistant question for H1', () => {
      // "Option 2" is too long for H4 but short enough for H1
      const r = routeByRules('Option 2, the second approach', 'I made the changes.');
      expect(r).toBeNull(); // assistant didn't ask a question
    });

    it('rejects new observations even after a question', () => {
      const r = routeByRules(
        'It shows a white cursor now instead',
        'Does the ghost cursor disappear?',
      );
      expect(r).toBeNull();
    });

    it('rejects long responses (new topic, not an answer)', () => {
      const long = 'A'.repeat(150);
      const r = routeByRules(long, 'Which option?');
      expect(r).toBeNull();
    });
  });

  describe('H2 — verification/status checks', () => {
    it('matches "can you confirm all 30 modules"', () => {
      const r = routeByRules('Can you confirm all 30 modules are done?');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H2' });
    });

    it('matches "is it still running"', () => {
      const r = routeByRules('Is it still running?');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H2' });
    });

    it('matches "are any missing"', () => {
      const r = routeByRules('Are any modules missing from the list?');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H2' });
    });

    it('rejects long bug reports with verification keywords', () => {
      const long = 'Can you confirm this? ' + 'Bug description. '.repeat(15);
      const r = routeByRules(long);
      expect(r).toBeNull();
    });
  });

  describe('H3 — factual lookups', () => {
    it('matches "how does X work"', () => {
      const r = routeByRules('How does the context injection work?');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H3' });
    });

    it('matches "what is X"', () => {
      const r = routeByRules('What is the default model?');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H3' });
    });

    it('rejects if judgment words present', () => {
      const r = routeByRules('What do you think is the best approach?');
      // Should match O1 instead (judgment), not H3
      expect(r?.rule).not.toBe('H3');
    });
  });

  describe('H4 — simple confirmations', () => {
    it('matches "yes"', () => {
      expect(routeByRules('yes')).toMatchObject({ tier: 'HAIKU', rule: 'H4' });
    });

    it('matches "do it"', () => {
      expect(routeByRules('do it')).toMatchObject({ tier: 'HAIKU', rule: 'H4' });
    });

    it('rejects longer text', () => {
      expect(routeByRules('yes but also fix the header')).toBeNull();
    });
  });

  describe('H5 — simple continuation', () => {
    it('matches "next" with prior context', () => {
      const r = routeByRules('next', 'I finished clearing all 10 instances.');
      expect(r).toMatchObject({ tier: 'HAIKU', rule: 'H5' });
    });

    it('rejects "next" without context', () => {
      expect(routeByRules('next')).toBeNull();
    });
  });

  describe('O1 — judgment/opinion seeking', () => {
    it('matches "what do you think"', () => {
      const r = routeByRules('What do you think about this architecture?');
      expect(r).toMatchObject({ tier: 'OPUS', rule: 'O1' });
    });

    it('matches "any improvements"', () => {
      const r = routeByRules('Review this — any improvements you can suggest?');
      expect(r).toMatchObject({ tier: 'OPUS', rule: 'O1' });
    });
  });

  describe('O2 — planning at system scope', () => {
    it('matches "create a plan" + scope signal', () => {
      const r = routeByRules('Create a plan to refactor the entire frontend');
      expect(r).toMatchObject({ tier: 'OPUS', rule: 'O2' });
    });

    it('rejects planning verb without scope signal', () => {
      const r = routeByRules('Create a plan for this function');
      expect(r?.rule).not.toBe('O2');
    });
  });

  describe('O3 — competitive design', () => {
    it('matches "like Cursor"', () => {
      const r = routeByRules('Make the chat look like Cursor');
      expect(r).toMatchObject({ tier: 'OPUS', rule: 'O3' });
    });

    it('matches "industry standard"', () => {
      const r = routeByRules('Refactor to industry standard patterns');
      expect(r).toMatchObject({ tier: 'OPUS', rule: 'O3' });
    });
  });

  describe('S1 — pasted-only prompts', () => {
    it('matches pasted text placeholder', () => {
      const r = routeByRules('[Pasted text #3 +42 lines]');
      expect(r).toMatchObject({ tier: 'SONNET', rule: 'S1', confidence: 'MEDIUM' });
    });
  });

  describe('S3 — go ahead after a plan', () => {
    it('matches "go ahead" when prev assistant was long', () => {
      const longPlan = 'Here is the plan:\n' + '- Step '.repeat(60);
      const r = routeByRules('go ahead', longPlan);
      expect(r).toMatchObject({ tier: 'SONNET', rule: 'S3' });
    });

    it('rejects "go ahead" when prev was short', () => {
      const r = routeByRules('go ahead', 'OK done.');
      expect(r?.rule).not.toBe('S3');
    });
  });

  describe('default fallthrough', () => {
    it('returns null for ambiguous mid-range prompts', () => {
      const r = routeByRules('Fix the CSS padding on the header component');
      expect(r).toBeNull();
    });

    it('returns null for bug reports', () => {
      const r = routeByRules('The terminal flickers when I resize it');
      expect(r).toBeNull();
    });
  });
});
