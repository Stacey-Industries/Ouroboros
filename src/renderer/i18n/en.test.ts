import { describe, expect, it } from 'vitest';

import { EN_STRINGS } from './en';

describe('EN_STRINGS', () => {
  it('has all 5 onboarding steps with title and body', () => {
    for (let i = 1; i <= 5; i++) {
      const step = EN_STRINGS.onboarding[`step${i}` as keyof typeof EN_STRINGS.onboarding];
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });

  it('has emptyState keys for chat, fileTree, terminal', () => {
    expect(EN_STRINGS.emptyState.chat.primary).toBeTruthy();
    expect(EN_STRINGS.emptyState.fileTree.primary).toBeTruthy();
    expect(EN_STRINGS.emptyState.terminal.primary).toBeTruthy();
  });

  it('has settings.updateChannel, language, crashReports', () => {
    expect(EN_STRINGS.settings.updateChannel.label).toBeTruthy();
    expect(EN_STRINGS.settings.language.label).toBeTruthy();
    expect(EN_STRINGS.settings.crashReports.label).toBeTruthy();
  });

  it('has changelog drawer keys', () => {
    expect(EN_STRINGS.changelog.drawer.title).toBeTruthy();
    expect(EN_STRINGS.changelog.drawer.dismissAll).toBeTruthy();
  });

  it('has tour navigation keys', () => {
    expect(EN_STRINGS.tour.next).toBeTruthy();
    expect(EN_STRINGS.tour.back).toBeTruthy();
    expect(EN_STRINGS.tour.skip).toBeTruthy();
    expect(EN_STRINGS.tour.done).toBeTruthy();
  });

  it('has common utility keys', () => {
    expect(EN_STRINGS.common.close).toBeTruthy();
    expect(EN_STRINGS.common.cancel).toBeTruthy();
  });
});
