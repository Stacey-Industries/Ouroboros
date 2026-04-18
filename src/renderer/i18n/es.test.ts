/**
 * es.test.ts — Wave 38 Phase G: Spanish translation smoke tests.
 *
 * Extends Phase A structural tests with non-identity assertions that confirm
 * each ES string has actually been translated (not left as English placeholder).
 *
 * Allowlist: brand names and locale-neutral tokens that must NOT be translated.
 */

import { describe, expect, it } from 'vitest';

import { EN_STRINGS } from './en';
import { ES_STRINGS } from './es';

// ---------------------------------------------------------------------------
// Brand names / locale-neutral values that are intentionally identical in ES.
// ---------------------------------------------------------------------------

const ALLOWED_IDENTICAL = new Set([
  // Brand names
  'Ouroboros',
  'Claude Code',
  'Claude',
  'Codex',
  // Radio-button values that are proper names or locale-shared
  'Beta',
  // The English option label stays "English" in both locales per UX convention
  'English',
  // Numeric / symbol-only strings
  'OK',
]);

function isAllowedIdentical(value: string): boolean {
  // Allow if the string is or contains only brand/allowed words.
  if (ALLOWED_IDENTICAL.has(value)) return true;
  // Allow if the entire string is composed of allowed tokens (split on space).
  const words = value.split(' ');
  return words.every((w) => ALLOWED_IDENTICAL.has(w));
}

// ---------------------------------------------------------------------------
// Structural tests (carried over from Phase A)
// ---------------------------------------------------------------------------

describe('ES_STRINGS structure', () => {
  it('has all 5 onboarding steps with title and body', () => {
    for (let i = 1; i <= 5; i++) {
      const step = ES_STRINGS.onboarding[`step${i}` as keyof typeof ES_STRINGS.onboarding];
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });

  it('has emptyState keys for chat, fileTree, terminal', () => {
    expect(ES_STRINGS.emptyState.chat.primary).toBeTruthy();
    expect(ES_STRINGS.emptyState.fileTree.primary).toBeTruthy();
    expect(ES_STRINGS.emptyState.terminal.primary).toBeTruthy();
  });

  it('has settings.updateChannel, language, crashReports', () => {
    expect(ES_STRINGS.settings.updateChannel.label).toBeTruthy();
    expect(ES_STRINGS.settings.language.label).toBeTruthy();
    expect(ES_STRINGS.settings.crashReports.label).toBeTruthy();
  });

  it('has changelog drawer keys', () => {
    expect(ES_STRINGS.changelog.drawer.title).toBeTruthy();
    expect(ES_STRINGS.changelog.drawer.dismissAll).toBeTruthy();
  });

  it('has tour navigation keys', () => {
    expect(ES_STRINGS.tour.next).toBeTruthy();
    expect(ES_STRINGS.tour.back).toBeTruthy();
    expect(ES_STRINGS.tour.skip).toBeTruthy();
    expect(ES_STRINGS.tour.done).toBeTruthy();
  });

  it('has common utility keys', () => {
    expect(ES_STRINGS.common.close).toBeTruthy();
    expect(ES_STRINGS.common.cancel).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Phase G: non-identity assertions — translations must differ from English
// ---------------------------------------------------------------------------

describe('ES_STRINGS translations differ from English', () => {
  it('onboarding step titles are translated', () => {
    for (let i = 1; i <= 5; i++) {
      const key = `step${i}` as keyof typeof ES_STRINGS.onboarding;
      const esTitle = ES_STRINGS.onboarding[key].title;
      const enTitle = EN_STRINGS.onboarding[key].title;
      if (!isAllowedIdentical(esTitle)) {
        expect(esTitle).not.toBe(enTitle);
      }
    }
  });

  it('onboarding step bodies are translated', () => {
    for (let i = 1; i <= 5; i++) {
      const key = `step${i}` as keyof typeof ES_STRINGS.onboarding;
      const esBody = ES_STRINGS.onboarding[key].body;
      const enBody = EN_STRINGS.onboarding[key].body;
      expect(esBody).not.toBe(enBody);
    }
  });

  it('emptyState.chat strings are translated', () => {
    expect(ES_STRINGS.emptyState.chat.primary).not.toBe(EN_STRINGS.emptyState.chat.primary);
    expect(ES_STRINGS.emptyState.chat.dismiss).not.toBe(EN_STRINGS.emptyState.chat.dismiss);
  });

  it('emptyState.fileTree strings are translated', () => {
    expect(ES_STRINGS.emptyState.fileTree.primary).not.toBe(EN_STRINGS.emptyState.fileTree.primary);
    expect(ES_STRINGS.emptyState.fileTree.action).not.toBe(EN_STRINGS.emptyState.fileTree.action);
    expect(ES_STRINGS.emptyState.fileTree.dismiss).not.toBe(EN_STRINGS.emptyState.fileTree.dismiss);
  });

  it('emptyState.terminal strings are translated', () => {
    expect(ES_STRINGS.emptyState.terminal.primary).not.toBe(EN_STRINGS.emptyState.terminal.primary);
    expect(ES_STRINGS.emptyState.terminal.action).not.toBe(EN_STRINGS.emptyState.terminal.action);
    expect(ES_STRINGS.emptyState.terminal.dismiss).not.toBe(EN_STRINGS.emptyState.terminal.dismiss);
  });

  it('settings.updateChannel is translated', () => {
    expect(ES_STRINGS.settings.updateChannel.label).not.toBe(EN_STRINGS.settings.updateChannel.label);
    expect(ES_STRINGS.settings.updateChannel.stable).not.toBe(EN_STRINGS.settings.updateChannel.stable);
    // Beta is a proper noun — allowed to remain identical
    expect(isAllowedIdentical(ES_STRINGS.settings.updateChannel.beta)).toBe(true);
  });

  it('settings.language is translated', () => {
    expect(ES_STRINGS.settings.language.label).not.toBe(EN_STRINGS.settings.language.label);
    // english option stays "English" in both locales (UX convention)
    expect(isAllowedIdentical(ES_STRINGS.settings.language.english)).toBe(true);
    expect(ES_STRINGS.settings.language.spanish).not.toBe(EN_STRINGS.settings.language.spanish);
  });

  it('settings.crashReports is translated', () => {
    expect(ES_STRINGS.settings.crashReports.label).not.toBe(EN_STRINGS.settings.crashReports.label);
    expect(ES_STRINGS.settings.crashReports.enableOptIn).not.toBe(EN_STRINGS.settings.crashReports.enableOptIn);
    expect(ES_STRINGS.settings.crashReports.webhookLabel).not.toBe(EN_STRINGS.settings.crashReports.webhookLabel);
  });

  it('changelog.drawer is translated', () => {
    expect(ES_STRINGS.changelog.drawer.title).not.toBe(EN_STRINGS.changelog.drawer.title);
    expect(ES_STRINGS.changelog.drawer.dismissAll).not.toBe(EN_STRINGS.changelog.drawer.dismissAll);
  });

  it('tour navigation is translated', () => {
    expect(ES_STRINGS.tour.next).not.toBe(EN_STRINGS.tour.next);
    expect(ES_STRINGS.tour.back).not.toBe(EN_STRINGS.tour.back);
    expect(ES_STRINGS.tour.skip).not.toBe(EN_STRINGS.tour.skip);
    expect(ES_STRINGS.tour.done).not.toBe(EN_STRINGS.tour.done);
  });

  it('common utility strings are translated', () => {
    expect(ES_STRINGS.common.close).not.toBe(EN_STRINGS.common.close);
    expect(ES_STRINGS.common.cancel).not.toBe(EN_STRINGS.common.cancel);
    expect(ES_STRINGS.common.save).not.toBe(EN_STRINGS.common.save);
    expect(ES_STRINGS.common.error).not.toBe(EN_STRINGS.common.error);
    // OK is a locale-neutral abbreviation — may stay identical
    // loading has an ellipsis — check translation
    expect(ES_STRINGS.common.loading).not.toBe(EN_STRINGS.common.loading);
  });
});

// ---------------------------------------------------------------------------
// Specific known-correct spot checks
// ---------------------------------------------------------------------------

describe('ES_STRINGS spot checks for correctness', () => {
  it('onboarding.step1.title is the correct Spanish greeting', () => {
    expect(ES_STRINGS.onboarding.step1.title).toBe('Bienvenido a Ouroboros');
  });

  it('tour.next is Siguiente', () => {
    expect(ES_STRINGS.tour.next).toBe('Siguiente');
  });

  it('emptyState.chat.primary matches spec example', () => {
    expect(ES_STRINGS.emptyState.chat.primary).toBe(
      'Inicia una conversación o prueba un mensaje de ejemplo',
    );
  });

  it('settings.updateChannel.label is Canal de actualización', () => {
    expect(ES_STRINGS.settings.updateChannel.label).toBe('Canal de actualización');
  });

  it('settings.language.label is Idioma', () => {
    expect(ES_STRINGS.settings.language.label).toBe('Idioma');
  });
});
