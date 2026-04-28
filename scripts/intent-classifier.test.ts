/**
 * intent-classifier.test.ts — Wave 53c Phase A
 *
 * ~50 fixture prompts spanning all 7 intent buckets.
 * Covers: continuation (exact and phrase), multi-signal (strongest wins),
 * ambiguous fallthrough to `other`, edge cases (empty, whitespace, long).
 */

import { describe, expect, it } from 'vitest';

import { classifyIntent } from './intent-classifier';

// ─── Continuation ─────────────────────────────────────────────────────────────

describe('continuation bucket', () => {
  it('bare "go" → continuation', () => {
    const r = classifyIntent('go');
    expect(r.bucket).toBe('continuation');
  });

  it('"Go ahead" (mixed case) → continuation', () => {
    const r = classifyIntent('Go ahead');
    expect(r.bucket).toBe('continuation');
    expect(r.signals).toContain('go-ahead');
  });

  it('"yes" → continuation', () => {
    expect(classifyIntent('yes').bucket).toBe('continuation');
  });

  it('"ok" → continuation', () => {
    expect(classifyIntent('ok').bucket).toBe('continuation');
  });

  it('"ok do it" → continuation', () => {
    const r = classifyIntent('ok do it');
    expect(r.bucket).toBe('continuation');
    expect(r.signals).toContain('do-it');
  });

  it('"proceed" → continuation', () => {
    expect(classifyIntent('proceed').bucket).toBe('continuation');
  });

  it('"continue" → continuation', () => {
    const r = classifyIntent('continue');
    expect(r.bucket).toBe('continuation');
    expect(r.signals).toContain('continue');
  });

  it('"next" → continuation', () => {
    expect(classifyIntent('next').bucket).toBe('continuation');
  });

  it('"sounds good" → continuation', () => {
    const r = classifyIntent('sounds good');
    expect(r.bucket).toBe('continuation');
    expect(r.signals).toContain('sounds-good');
  });

  it('"lgtm" → continuation', () => {
    const r = classifyIntent('lgtm');
    expect(r.bucket).toBe('continuation');
    expect(r.signals).toContain('lgtm');
  });

  it('confidence is 1 for continuation', () => {
    expect(classifyIntent('go').confidence).toBe(1);
  });
});

// ─── Bug-fix ──────────────────────────────────────────────────────────────────

describe('bug-fix bucket', () => {
  it('canonical "fix" prompt → bug-fix', () => {
    const r = classifyIntent('Fix the crash in the main process');
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain('fix');
  });

  it('"error" in prompt → bug-fix', () => {
    const r = classifyIntent('What caused this error in the terminal output?');
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain('error');
  });

  it('"regression" prompt → bug-fix', () => {
    const r = classifyIntent('This looks like a regression from the last wave');
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain('regression');
  });

  it('"doesn\'t work" → bug-fix', () => {
    const r = classifyIntent("The settings panel doesn't work after the update");
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain("doesn't-work");
  });

  it('"not working" → bug-fix', () => {
    const r = classifyIntent('Hot-reload is not working on Windows');
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain('not-working');
  });

  it('"failing" → bug-fix', () => {
    const r = classifyIntent('The vitest suite is failing on the IPC tests');
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain('failing');
  });

  it('"broken" → bug-fix', () => {
    const r = classifyIntent('The file tree is broken after the refactor');
    expect(r.bucket).toBe('bug-fix');
    expect(r.signals).toContain('broken');
  });
});

// ─── Feature ──────────────────────────────────────────────────────────────────

describe('feature bucket', () => {
  it('"implement" prompt → feature', () => {
    const r = classifyIntent('Implement the drag-and-drop panel reorder');
    expect(r.bucket).toBe('feature');
    expect(r.signals).toContain('implement');
  });

  it('"add" a new capability → feature', () => {
    const r = classifyIntent('Add support for multiple workspaces');
    expect(r.bucket).toBe('feature');
    expect(r.signals).toContain('add');
  });

  it('"build" a feature → feature', () => {
    const r = classifyIntent('Build the token usage dashboard panel');
    expect(r.bucket).toBe('feature');
    expect(r.signals).toContain('build');
  });

  it('"create" something new → feature', () => {
    const r = classifyIntent('Create a new slash command for context management');
    expect(r.bucket).toBe('feature');
    expect(r.signals).toContain('create');
  });

  it('"wire up" the IPC → feature', () => {
    const r = classifyIntent('Wire up the IPC handler for the new settings panel');
    expect(r.bucket).toBe('feature');
    expect(r.signals).toContain('wire-up');
  });
});

// ─── Refactor ─────────────────────────────────────────────────────────────────

describe('refactor bucket', () => {
  it('"refactor" prompt → refactor', () => {
    const r = classifyIntent('Refactor the IPC handler into smaller functions');
    expect(r.bucket).toBe('refactor');
    expect(r.signals).toContain('refactor');
  });

  it('"rename" → refactor', () => {
    const r = classifyIntent('Rename useAgentEvents to useSessionEvents');
    expect(r.bucket).toBe('refactor');
    expect(r.signals).toContain('rename');
  });

  it('"extract" helper → refactor', () => {
    const r = classifyIntent('Extract the parsing logic into a separate helper');
    expect(r.bucket).toBe('refactor');
    expect(r.signals).toContain('extract');
  });

  it('"clean up" → refactor', () => {
    const r = classifyIntent('Clean up the dead code in the context worker');
    expect(r.bucket).toBe('refactor');
    expect(r.signals).toContain('clean-up');
  });

  it('"split" → refactor', () => {
    const r = classifyIntent('Split the 400-line IPC file into smaller modules');
    expect(r.bucket).toBe('refactor');
    expect(r.signals).toContain('split');
  });
});

// ─── Review ───────────────────────────────────────────────────────────────────

describe('review bucket', () => {
  it('"review" prompt → review', () => {
    const r = classifyIntent('Review this session JSONL — is it injecting too much context?');
    expect(r.bucket).toBe('review');
    expect(r.signals).toContain('review');
  });

  it('"audit" → review', () => {
    const r = classifyIntent('Audit the token usage for the last three sessions');
    expect(r.bucket).toBe('review');
    expect(r.signals).toContain('audit');
  });

  it('"double check" → review', () => {
    const r = classifyIntent('Double check the config schema before we ship');
    expect(r.bucket).toBe('review');
    expect(r.signals).toContain('double-check');
  });

  it('"confirm" → review', () => {
    const r = classifyIntent('Confirm the IDE is not injecting overkill context after turn 1');
    expect(r.bucket).toBe('review');
    expect(r.signals).toContain('confirm');
  });
});

// ─── Meta-UX ──────────────────────────────────────────────────────────────────

describe('meta-ux bucket', () => {
  it('"don\'t" do X → meta-ux when meta-ux signals dominate', () => {
    // Multiple meta-ux signals outweigh the single 'add' feature signal
    const r = classifyIntent("Don't always do this — from now on, never add that");
    expect(r.bucket).toBe('meta-ux');
    expect(r.signals).toContain('dont');
  });

  it('"always" do X → meta-ux', () => {
    const r = classifyIntent('Always use the existing token system, never hardcode colors');
    expect(r.bucket).toBe('meta-ux');
    expect(r.signals).toContain('always');
  });

  it('"from now on" → meta-ux', () => {
    const r = classifyIntent('From now on, commit per phase, not per file');
    expect(r.bucket).toBe('meta-ux');
    expect(r.signals).toContain('from-now-on');
  });

  it('"you keep doing" → meta-ux', () => {
    const r = classifyIntent('You keep adding unnecessary abstraction layers');
    expect(r.bucket).toBe('meta-ux');
    expect(r.signals).toContain('you-keep-doing');
  });

  it('"stop doing" → meta-ux', () => {
    const r = classifyIntent('Stop adding markdown headers to every comment');
    expect(r.bucket).toBe('meta-ux');
    expect(r.signals).toContain('stop-doing');
  });
});

// ─── Other (fallthrough) ──────────────────────────────────────────────────────

describe('other bucket', () => {
  it('empty string → other', () => {
    const r = classifyIntent('');
    expect(r.bucket).toBe('other');
    expect(r.confidence).toBe(0);
    expect(r.signals).toHaveLength(0);
  });

  it('whitespace-only → other', () => {
    expect(classifyIntent('   \n\t  ').bucket).toBe('other');
  });

  it('generic question with no signals → other', () => {
    const r = classifyIntent('What is the wave process?');
    expect(r.bucket).toBe('other');
  });

  it('ambiguous one-word token-like → other', () => {
    expect(classifyIntent('telemetry').bucket).toBe('other');
  });

  it('very long prompt with no bucket signals → other', () => {
    const long = 'The quick brown fox jumped over the lazy dog. '.repeat(40);
    expect(classifyIntent(long).bucket).toBe('other');
  });
});

// ─── Multi-signal / strongest-bucket-wins ─────────────────────────────────────

describe('strongest bucket wins', () => {
  it('bug-fix beats feature when more bug signals match', () => {
    // "fix" + "broken" + "error" vs "add" → bug-fix wins
    const r = classifyIntent('Fix the broken error handler and add a fallback');
    expect(r.bucket).toBe('bug-fix');
  });

  it('refactor beats feature when more refactor signals match', () => {
    // "rename" + "extract" + "split" vs "add" → refactor wins
    const r = classifyIntent('Rename and extract the helper, then split the module and add tests');
    expect(r.bucket).toBe('refactor');
  });

  it('continuation wins even if other signals present', () => {
    // Short "go ahead" + "fix" still → continuation because continuation runs first
    const r = classifyIntent('go ahead and fix it');
    expect(r.bucket).toBe('continuation');
  });

  it('tie broken by bucket order: bug-fix before feature', () => {
    // "fix" + "crash" (2 bug-fix) vs "add" (1 feature) → bug-fix wins on count
    const r = classifyIntent('Fix the crash and add a handler');
    expect(r.bucket).toBe('bug-fix');
  });
});

// ─── Confidence shape ─────────────────────────────────────────────────────────

describe('confidence', () => {
  it('is between 0 and 1 for all buckets', () => {
    const prompts = [
      'Fix the broken crash',
      'Implement the new feature',
      'Refactor and rename the helper',
      'Review the audit trail',
      "Don't always do this",
      'go ahead',
      'something unrelated',
    ];
    for (const p of prompts) {
      const { confidence } = classifyIntent(p);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });

  it('more matching signals → higher confidence within same bucket', () => {
    const weak = classifyIntent('fix it');
    const strong = classifyIntent('fix the broken crash error and regression failing');
    expect(strong.confidence).toBeGreaterThanOrEqual(weak.confidence);
  });
});
