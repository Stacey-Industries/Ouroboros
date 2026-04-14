/**
 * settingsEntries.ts - Static metadata for all settings fields.
 *
 * Each entry describes a setting well enough for full-text search to find it
 * and for the search results panel to navigate to its parent section.
 *
 * Keybindings, hooks, files, extensions, code mode, context docs, and MCP
 * entries are defined in settingsEntriesData.ts to keep both files under 300
 * lines.
 */

import {
  CODE_MODE_ENTRIES,
  CONTEXT_DOCS_ENTRIES,
  EXTENSION_ENTRIES,
  FILE_ENTRIES,
  HOOK_ENTRIES,
  KEYBINDING_ENTRIES,
  MCP_ENTRIES,
} from './settingsEntriesData';

export interface SettingsEntry {
  /** Human-readable label shown in search results */
  label: string;
  /** Optional extra text to match against (not always shown) */
  description?: string;
  /** Which settings tab this entry lives in */
  section:
    | 'accounts'
    | 'general'
    | 'appearance'
    | 'fonts'
    | 'terminal'
    | 'agent'
    | 'claude'
    | 'codex'
    | 'providers'
    | 'keybindings'
    | 'hooks'
    | 'profiles'
    | 'files'
    | 'integrations'
    | 'codemode'
    | 'contextDocs'
    | 'performance';
  /** Display-friendly section name */
  sectionLabel: string;
}

type EntryDefinition = readonly [label: string, description?: string];
type SettingsSection = SettingsEntry['section'];

function createEntries(
  section: SettingsSection,
  sectionLabel: string,
  definitions: readonly EntryDefinition[],
): SettingsEntry[] {
  return definitions.map(([label, description]) => ({ label, description, section, sectionLabel }));
}

const ACCOUNTS_ENTRIES = createEntries('accounts', 'Accounts', [
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

const EDITOR_ENTRIES = createEntries('general', 'General', [
  [
    'Format on Save',
    'Automatically format documents when saving (requires a language formatting provider).',
  ],
]);

const GENERAL_ENTRIES = createEntries('general', 'General', [
  ['Default Project Folder', 'The folder Ouroboros opens by default when no project is loaded.'],
  ['Recent Projects', 'List of recently opened project folders. Clear all recent projects.'],
  [
    'Auto-install hook scripts',
    'Automatically copies Claude Code hook scripts to ~/.claude/hooks/ on launch so Ouroboros receives live tool events.',
  ],
  ['Export Settings', 'Save all settings to a JSON file for backup or sharing.'],
  ['Import Settings', 'Load settings from a previously exported JSON file.'],
  ['Open settings.json', 'Edit settings directly as a JSON file in your system editor.'],
  [
    'Agent Notifications',
    'Desktop notification level for agent completion: all, errors only, or none.',
  ],
  ['Always Notify', 'Show desktop notifications even when the app window is in the foreground.'],
  [
    'Workspace Layouts',
    'Save and restore panel arrangements for different workflows (monitoring, review, coding). Switch with Ctrl+Alt+1/2/3.',
  ],
  [
    'Enable LSP',
    'Enable Language Server Protocol integration for code intelligence (completions, diagnostics, hover, go-to-definition).',
  ],
  [
    'Inline Completions',
    'Show AI-powered code suggestions as you type (ghost text). Uses your Claude credentials.',
  ],
  [
    'Custom Language Servers',
    'Configure custom language server commands per language. For example, use "rust-analyzer" for Rust or "pylsp" for Python.',
  ],
  [
    'Web Access Password',
    'Set a password for mobile/remote login instead of the auto-generated access token.',
  ],
  ['Web Access Port', 'Port for the web remote access server (requires restart). Default: 7890.'],
  [
    'Developer Flags',
    'Advanced utility-process feature flags: PTY host, extension host, MCP host. Require restart.',
  ],
  [
    'PTY Host Process',
    'Route terminal PTY sessions through a dedicated PtyHost utility process. Requires restart.',
  ],
  [
    'Extension Host Process',
    'Load VS Code extensions in an isolated ExtensionHost utility process. Requires restart.',
  ],
  [
    'MCP Host Process',
    'Run the internal MCP server in a dedicated McpHost utility process. Requires restart.',
  ],
]);

const APPEARANCE_ENTRIES = createEntries('appearance', 'Appearance', [
  ['Theme', 'Choose between retro, modern, warp, cursor, kiro, and custom themes.'],
  ['Background Gradient', 'Show or hide the subtle gradient overlay on the main background.'],
  ['Theme Editor', 'Customize individual color tokens and save as a custom theme.'],
]);

const FONT_ENTRIES = createEntries('fonts', 'Fonts', [
  ['UI Font Family', 'Font used for the interface. Leave blank to use the system default.'],
  [
    'Monospace Font Family',
    'Font used for code, file viewer, and terminal UI. Leave blank for the theme default.',
  ],
  ['UI Font Size', 'Base font size for the interface (11-18px).'],
]);

const TERMINAL_ENTRIES = createEntries('terminal', 'Terminal', [
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

const AGENT_ENTRIES = createEntries('agent', 'Agent', [
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

const CLAUDE_ENTRIES = createEntries('claude', 'Claude Code', [
  ['Permission Mode', 'Controls how Claude handles tool permission requests in Claude terminals.'],
  ['Model Override', 'Override the default model for Claude Code sessions (sonnet, opus, haiku).'],
  ['Effort Level', 'Controls response effort: low, medium, high, or max.'],
  ['Verbose Output', 'Show detailed output during Claude Code sessions.'],
  ['Max Budget (USD)', 'Maximum dollar amount to spend per Claude Code session. 0 for unlimited.'],
  ['Allowed Tools', 'Comma-separated list of tools Claude is allowed to use.'],
  ['Disallowed Tools', 'Comma-separated list of tools Claude is blocked from using.'],
  ['System Prompt (Append)', 'Additional instructions appended to Claude default system prompt.'],
  ['Additional Directories', 'Extra directories Claude Code can access beyond the project root.'],
  ['Chrome Integration', 'Enable Claude in Chrome browser automation integration.'],
  ['Git Worktree', 'Create a new git worktree for each Claude Code session.'],
  [
    'Skip Permission Checks',
    'Dangerously bypass all permission checks. Only for sandboxed environments.',
  ],
  [
    'Agent Templates',
    'Pre-configured launch profiles for Claude Code sessions. Edit, add, or remove quick-action templates.',
  ],
]);

const CODEX_ENTRIES = createEntries('codex', 'Codex', [
  ['Model Override', 'Override the default model for Codex CLI sessions.'],
  ['Reasoning Effort', 'Controls Codex reasoning depth: low, medium, high, or xhigh.'],
  [
    'Sandbox Mode',
    'Controls Codex command sandboxing: read-only, workspace-write, or danger-full-access.',
  ],
  [
    'Approval Policy',
    'Controls when Codex asks for command approval: untrusted, on-request, or never.',
  ],
  ['Config Profile', 'Optional profile from ~/.codex/config.toml used when launching Codex.'],
  ['Live Web Search', 'Enable the native Responses web_search tool for Codex sessions.'],
  ['Additional Directories', 'Extra directories Codex can write to beyond the primary workspace.'],
  ['Skip Git Repo Check', 'Allow Codex to run outside a git repository.'],
  [
    'Bypass Approvals And Sandbox',
    'Dangerously disable all Codex approval prompts and sandboxing.',
  ],
]);

const PROVIDER_ENTRIES = createEntries('providers', 'Providers', [
  [
    'Model Providers',
    'Configure LLM providers (Anthropic, MiniMax, OpenRouter) with API endpoints and keys.',
  ],
  [
    'Terminal Model',
    'Which provider and model to use for interactive Claude Code terminal sessions.',
  ],
  ['Agent Chat Model', 'Which provider and model to use for agent chat subagent sessions.'],
  [
    'CLAUDE.md Generation Model',
    'Which provider and model to use for automated CLAUDE.md generation.',
  ],
  ['Add Provider', 'Add a new Anthropic-compatible LLM provider with API endpoint and key.'],
  ['Test Connection', 'Verify that a provider endpoint is reachable and the API key is valid.'],
  [
    'Anthropic API Key',
    'Enter your Anthropic API key (sk-ant-...) to authenticate with Claude models.',
  ],
  [
    'OpenAI API Key',
    'Enter your OpenAI API key (sk-...) to authenticate with Codex and GPT models.',
  ],
]);

const PERFORMANCE_ENTRIES = createEntries('performance', 'Performance', [
  ['Startup Timings', 'View per-phase app startup times: app-ready, window-created, ipc-ready, services-ready, first-render.'],
  ['Runtime Metrics', 'Live heap used/total, external memory, and CPU usage. Updated every 5 seconds.'],
  ['Heap Usage', 'View current and total V8 heap allocation.'],
  ['CPU Usage', 'View main-process CPU percentage snapshot.'],
  ['Performance Diagnostics', 'Diagnostic panel showing startup and runtime performance metrics.'],
]);

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  ...ACCOUNTS_ENTRIES,
  ...EDITOR_ENTRIES,
  ...GENERAL_ENTRIES,
  ...APPEARANCE_ENTRIES,
  ...FONT_ENTRIES,
  ...TERMINAL_ENTRIES,
  ...AGENT_ENTRIES,
  ...CLAUDE_ENTRIES,
  ...CODEX_ENTRIES,
  ...PROVIDER_ENTRIES,
  ...KEYBINDING_ENTRIES,
  ...HOOK_ENTRIES,
  ...FILE_ENTRIES,
  ...EXTENSION_ENTRIES,
  ...CODE_MODE_ENTRIES,
  ...MCP_ENTRIES,
  ...CONTEXT_DOCS_ENTRIES,
  ...PERFORMANCE_ENTRIES,
];
