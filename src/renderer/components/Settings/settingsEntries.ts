/**
 * settingsEntries.ts - Static metadata for all settings fields.
 *
 * Each entry describes a setting well enough for full-text search to find it
 * and for the search results panel to navigate to its parent section.
 */

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
    | 'extensions'
    | 'mcp'
    | 'codemode'
    | 'contextDocs';
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
  ['Accounts', 'Manage connected accounts and authentication for GitHub, Anthropic, and OpenAI.'],
  ['GitHub', 'Sign in with GitHub via Device Flow for repository access and authentication.'],
  ['Anthropic', 'Connect your Anthropic account with an API key for Claude access.'],
  ['Claude', 'Connect your Claude / Anthropic account with an API key.'],
  ['OpenAI', 'Connect your OpenAI account with an API key for Codex and GPT access.'],
  ['Codex', 'OpenAI Codex authentication — requires an OpenAI API key.'],
  ['Login', 'Sign in to GitHub, Anthropic, or OpenAI from the Accounts tab.'],
  ['Authentication', 'Manage authentication credentials for all supported providers.'],
  ['Credentials', 'Import, enter, or manage API keys and OAuth tokens for connected services.'],
  ['API Key', 'Enter an API key to authenticate with Anthropic or OpenAI.'],
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
    'Custom Language Servers',
    'Configure custom language server commands per language. For example, use "rust-analyzer" for Rust or "pylsp" for Python.',
  ],
  [
    'Web Access Password',
    'Set a password for mobile/remote login instead of the auto-generated access token.',
  ],
  ['Web Access Port', 'Port for the web remote access server (requires restart). Default: 7890.'],
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
    'Enable Context Layer',
    'Generate and maintain a structural map of detected modules, injected into agent context automatically.',
  ],
  [
    'Auto-summarize Modules',
    'Use the Anthropic API (Haiku) to generate natural-language descriptions of each module.',
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
]);

const KEYBINDING_ENTRIES = createEntries('keybindings', 'Keybindings', [
  ['Open Settings', 'Keyboard shortcut to open the Settings dialog. Default: Ctrl+,'],
  ['Command Palette', 'Keyboard shortcut to open the Command Palette. Default: Ctrl+Shift+P'],
  ['Go to File (Picker)', 'Keyboard shortcut to open the file picker. Default: Ctrl+P'],
  ['Toggle Left Sidebar', 'Keyboard shortcut to show/hide the left sidebar. Default: Ctrl+B'],
  ['Toggle Terminal', 'Keyboard shortcut to show/hide the terminal panel. Default: Ctrl+J'],
  ['Toggle Agent Monitor', 'Keyboard shortcut to show/hide the Agent Monitor. Default: Ctrl+\\'],
  ['New Terminal Tab', 'Keyboard shortcut to open a new terminal tab.'],
  ['Find in File', 'Keyboard shortcut to search within the currently open file.'],
  ['Go to Line', 'Keyboard shortcut to jump to a specific line number.'],
  ['Toggle Diff View', 'Keyboard shortcut to toggle the git diff overlay in the file viewer.'],
  ['Fold All', 'Keyboard shortcut to collapse all code folds.'],
  ['Unfold All', 'Keyboard shortcut to expand all code folds.'],
  ['Toggle Word Wrap', 'Keyboard shortcut to toggle word wrap in the file viewer.'],
]);

const HOOK_ENTRIES = createEntries('hooks', 'Hooks', [
  ['Hook Scripts Status', 'Check and reinstall Claude Code hook scripts.'],
  ['Server Transport', 'Named pipe (Windows) or TCP fallback for hook events.'],
  [
    'TCP Fallback Port',
    'Port number for the TCP hook server on macOS/Linux (1024-65535). Default: 3333',
  ],
  [
    'Hook Scripts Location',
    'Directory where Claude Code hook scripts are installed: ~/.claude/hooks/',
  ],
]);

const FILE_ENTRIES = createEntries('files', 'Files', [
  [
    'Custom Ignore Patterns',
    'Add extra file or folder names to ignore in the file tree (e.g. vendor, *.log).',
  ],
]);

const EXTENSION_ENTRIES = createEntries('extensions', 'Extensions', [
  [
    'Installed Extensions',
    'View, enable, disable, and uninstall sandboxed extensions loaded from the extensions directory.',
  ],
  [
    'Install Extension',
    'Install an extension from a folder containing a manifest.json and entry script.',
  ],
  [
    'Open Extensions Folder',
    'Open the extensions/ folder inside userData in the system file manager.',
  ],
  [
    'Extension Commands',
    'Commands registered by extensions at runtime. Appear in the Command Palette under the Extension category.',
  ],
  [
    'Extension Permissions',
    'Extensions declare permissions in manifest.json: files.read, files.write, terminal.write, config.read, ui.notify, commands.register.',
  ],
]);

const CODE_MODE_ENTRIES = createEntries('codemode', 'Code Mode', [
  [
    'Code Mode',
    'Collapse MCP tools into a single execute_code tool with TypeScript types. Reduces context token usage.',
  ],
  [
    'Code Mode Server Names',
    'Comma-separated list of MCP server names to proxy through Code Mode.',
  ],
]);

const CONTEXT_DOCS_ENTRIES = createEntries('contextDocs', 'Context Docs', [
  [
    'Enable CLAUDE.md Automation',
    'Automatically generate and maintain CLAUDE.md context files for Claude Code agents.',
  ],
  ['Trigger Mode', 'When to regenerate: after Claude sessions, after git commits, or manual only.'],
  [
    'Generation Model',
    'Which Claude model to use for CLAUDE.md generation (Haiku is fast/cheap, Sonnet is balanced, Opus is thorough).',
  ],
  ['Auto-commit', 'Automatically commit generated CLAUDE.md files to git.'],
  ['Generate Root CLAUDE.md', 'Include the root project CLAUDE.md in automatic generation.'],
  [
    'Generate Subdirectory Files',
    'Generate CLAUDE.md files in subdirectories (src/main/, src/renderer/components/, etc.).',
  ],
  ['Exclude Directories', 'Directories to skip during CLAUDE.md generation (glob patterns).'],
  ['Generate Now', 'Manually trigger CLAUDE.md generation for changed directories.'],
  ['Full Sweep', 'Regenerate all CLAUDE.md files from scratch.'],
]);

const MCP_ENTRIES = createEntries('mcp', 'MCP Servers', [
  [
    'MCP Servers',
    'Configure Model Context Protocol servers that provide additional tools and capabilities to Claude Code.',
  ],
  [
    'Add MCP Server',
    'Add a new MCP server with command, arguments, environment variables, and scope (global or project).',
  ],
  [
    'MCP Server Scope',
    'Global servers are available in all projects. Project servers are specific to the current project.',
  ],
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
];
