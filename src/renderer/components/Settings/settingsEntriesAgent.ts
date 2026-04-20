/**
 * settingsEntriesAgent.ts - Agent and General settings entry definitions.
 * Split from settingsEntries.ts to satisfy the 300-line file limit.
 */

import type { SettingsEntry } from './settingsEntries';

type EntryDefinition = readonly [label: string, description?: string];
type SettingsSection = SettingsEntry['section'];

function createEntries(
  section: SettingsSection,
  sectionLabel: string,
  definitions: readonly EntryDefinition[],
): SettingsEntry[] {
  return definitions.map(([label, description]) => ({ label, description, section, sectionLabel }));
}

export const ACCOUNTS_ENTRIES = createEntries('accounts', 'Accounts', [
  [
    'Accounts',
    'Connect GitHub account and view CLI authentication status for Claude Code and Codex.',
  ],
  ['GitHub', 'Sign in with GitHub via Device Flow for repository access and authentication.'],
  [
    'Claude Code',
    'View Claude Code CLI authentication status detected from your terminal environment.',
  ],
  ['Codex', 'View Codex CLI authentication status detected from your terminal environment.'],
  ['Login', 'Sign in to GitHub from the Accounts tab.'],
  ['Authentication', 'Manage authentication credentials for connected services.'],
  [
    'Credentials',
    'Import OAuth tokens for GitHub or view CLI credentials for Claude Code and Codex.',
  ],
]);

export const APPEARANCE_ENTRIES = createEntries('appearance', 'Appearance', [
  ['Theme', 'Choose between retro, modern, warp, cursor, kiro, and custom themes.'],
  ['Background Gradient', 'Show or hide the subtle gradient overlay on the main background.'],
  ['Theme Editor', 'Customize individual color tokens and save as a custom theme.'],
]);

export const FONT_ENTRIES = createEntries('fonts', 'Fonts', [
  ['UI Font Family', 'Font used for the interface. Leave blank to use the system default.'],
  [
    'Monospace Font Family',
    'Font used for code, file viewer, and terminal UI. Leave blank for the theme default.',
  ],
  ['UI Font Size', 'Base font size for the interface (11-18px).'],
]);

export const TERMINAL_ENTRIES = createEntries('terminal', 'Terminal', [
  ['Terminal Font Size', 'Font size used inside terminal sessions (10-24px).'],
  ['Default Shell', 'Shell executable path used for new terminal sessions.'],
  ['Shell Prompt', 'Choose a prompt style: Default, Minimal, Git, Powerline, or Custom PS1.'],
  [
    'Custom Prompt (PS1)',
    'Enter a custom PS1 string to use as the shell prompt in terminal sessions.',
  ],
  [
    'Persist Terminal Sessions',
    'Save open terminal sessions to disk and restore them after restarting the app.',
  ],
]);

export const AGENT_ENTRIES = createEntries('agent', 'Agent', [
  ['Default Provider', 'Choose whether chat-first agent requests default to Claude Code or Codex.'],
  [
    'Default Verification Profile',
    'Choose whether the agent defaults to fast, default, or full verification.',
  ],
  [
    'Automatic Context Behavior',
    'Control whether the chat-first agent starts with automatic or manual context gathering.',
  ],
  [
    'Show Advanced Controls by Default',
    'Reveal provider and verification overrides in the chat composer without an extra click.',
  ],
  [
    'Open Details on Failure',
    'Automatically open linked task details when an agent request fails or needs review.',
  ],
  [
    'Automatic Model Routing',
    'Automatically choose Haiku, Sonnet, or Opus for Agent Chat when the model picker is set to Auto.',
  ],
  [
    'Router Rule Engine',
    'Use deterministic prompt rules and slash-command mappings as the first model-routing layer.',
  ],
  [
    'Router Classifier Threshold',
    'Minimum classifier confidence required before accepting a non-rule routing decision.',
  ],
  [
    'Router Paranoid Mode',
    'Force Opus for all Agent Chat requests regardless of prompt classification.',
  ],
  [
    'Enable Context Layer',
    'Generate and maintain a structural map of detected modules, injected into agent context automatically.',
  ],
  [
    'Auto-summarize Modules',
    'Use the Anthropic API (Haiku) to generate natural-language descriptions of each module.',
  ],
  [
    'Streaming Inline Edit',
    'Stream token-by-token diffs during Ctrl+K inline edits instead of displaying results when complete.',
  ],
  [
    'Background Jobs Concurrency',
    'Maximum number of background agent jobs that can run in parallel (1–8). Applies on next restart.',
  ],
  [
    'LLM Judge Sample Rate',
    'Fraction of agent responses sampled by the LLM judge for quality evaluation. 0 = disabled.',
  ],
]);
