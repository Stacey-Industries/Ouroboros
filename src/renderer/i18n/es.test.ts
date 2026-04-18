import { describe, expect, it } from 'vitest';

import { ES_STRINGS } from './es';

describe('ES_STRINGS', () => {
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
