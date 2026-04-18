/**
 * en.ts — English string table (primary locale).
 * Wave 38 Phase A: placeholder copy; Phase G will finalize translations.
 */
export const EN_STRINGS = {
  onboarding: {
    step1: {
      title: 'Welcome to Ouroboros',
      body: 'Your AI-powered IDE for running and monitoring Claude Code sessions.',
    },
    step2: {
      title: 'Your Sessions',
      body: 'Each terminal tab is an independent Claude Code session. Switch between them freely.',
    },
    step3: {
      title: 'Context Awareness',
      body: 'Open a project folder so Claude can read your codebase and give better answers.',
    },
    step4: {
      title: 'Command Palette',
      body: 'Press Cmd+Shift+P (or Ctrl+Shift+P) to access every command in the IDE.',
    },
    step5: {
      title: 'Settings',
      body: 'Reach Settings from the status bar at any time to customise your experience.',
    },
  },
  emptyState: {
    chat: {
      primary: 'Start a conversation or try a sample prompt',
      dismiss: 'Got it',
    },
    fileTree: {
      primary: 'Open a project folder to browse files',
      action: 'Open folder',
      dismiss: 'Dismiss',
    },
    terminal: {
      primary: 'Press + to open a terminal or start a Claude session',
      action: 'New terminal',
      dismiss: 'Dismiss',
    },
  },
  settings: {
    updateChannel: {
      label: 'Update channel',
      stable: 'Stable',
      beta: 'Beta',
    },
    language: {
      label: 'Language',
      english: 'English',
      spanish: 'Spanish',
    },
    crashReports: {
      label: 'Crash reports',
      enableOptIn: 'Send anonymous crash reports to help improve Ouroboros',
      webhookLabel: 'Crash report webhook URL',
    },
  },
  changelog: {
    drawer: {
      title: "What's new",
      dismissAll: 'Dismiss all',
    },
  },
  tour: {
    next: 'Next',
    back: 'Back',
    skip: 'Skip tour',
    done: 'Done',
  },
  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    ok: 'OK',
    loading: 'Loading…',
    error: 'Something went wrong',
  },
};
