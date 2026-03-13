/**
 * settingsEntries.ts — Static metadata for all settings fields.
 *
 * Each entry describes a setting well enough for full-text search to find it
 * and for the search results panel to navigate to its parent section.
 */

export interface SettingsEntry {
  /** Human-readable label shown in search results */
  label: string
  /** Optional extra text to match against (not always shown) */
  description?: string
  /** Which settings tab this entry lives in */
  section: 'general' | 'appearance' | 'fonts' | 'terminal' | 'claude' | 'keybindings' | 'hooks' | 'profiles' | 'files' | 'extensions' | 'mcp' | 'codemode'
  /** Display-friendly section name */
  sectionLabel: string
}

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  // ── General ───────────────────────────────────────────────────────────────
  {
    label: 'Default Project Folder',
    description: 'The folder Ouroboros opens by default when no project is loaded.',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Recent Projects',
    description: 'List of recently opened project folders. Clear all recent projects.',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Auto-install hook scripts',
    description: 'Automatically copies Claude Code hook scripts to ~/.claude/hooks/ on launch so Ouroboros receives live tool events.',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Export Settings',
    description: 'Save all settings to a JSON file for backup or sharing.',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Import Settings',
    description: 'Load settings from a previously exported JSON file.',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Open settings.json',
    description: 'Edit settings directly as a JSON file in your system editor.',
    section: 'general',
    sectionLabel: 'General',
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  {
    label: 'Agent Notifications',
    description: 'Desktop notification level for agent completion: all, errors only, or none.',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Always Notify',
    description: 'Show desktop notifications even when the app window is in the foreground.',
    section: 'general',
    sectionLabel: 'General',
  },

  // ── Appearance ────────────────────────────────────────────────────────────
  {
    label: 'Theme',
    description: 'Choose between retro, modern, warp, cursor, kiro, and custom themes.',
    section: 'appearance',
    sectionLabel: 'Appearance',
  },
  {
    label: 'Background Gradient',
    description: 'Show or hide the subtle gradient overlay on the main background.',
    section: 'appearance',
    sectionLabel: 'Appearance',
  },
  {
    label: 'Theme Editor',
    description: 'Customize individual color tokens and save as a custom theme.',
    section: 'appearance',
    sectionLabel: 'Appearance',
  },

  // ── Fonts ─────────────────────────────────────────────────────────────────
  {
    label: 'UI Font Family',
    description: 'Font used for the interface. Leave blank to use the system default.',
    section: 'fonts',
    sectionLabel: 'Fonts',
  },
  {
    label: 'Monospace Font Family',
    description: 'Font used for code, file viewer, and terminal UI. Leave blank for the theme default.',
    section: 'fonts',
    sectionLabel: 'Fonts',
  },
  {
    label: 'UI Font Size',
    description: 'Base font size for the interface (11–18px).',
    section: 'fonts',
    sectionLabel: 'Fonts',
  },

  // ── Terminal ──────────────────────────────────────────────────────────────
  {
    label: 'Terminal Font Size',
    description: 'Font size used inside terminal sessions (10–24px).',
    section: 'terminal',
    sectionLabel: 'Terminal',
  },
  {
    label: 'Default Shell',
    description: 'Shell executable path used for new terminal sessions.',
    section: 'terminal',
    sectionLabel: 'Terminal',
  },
  {
    label: 'Shell Prompt',
    description: 'Choose a prompt style: Default, Minimal, Git, Powerline, or Custom PS1.',
    section: 'terminal',
    sectionLabel: 'Terminal',
  },
  {
    label: 'Custom Prompt (PS1)',
    description: 'Enter a custom PS1 string to use as the shell prompt in terminal sessions.',
    section: 'terminal',
    sectionLabel: 'Terminal',
  },

  // ── Claude Code ─────────────────────────────────────────────────────────
  {
    label: 'Permission Mode',
    description: 'Controls how Claude handles tool permission requests in Claude terminals.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Model Override',
    description: 'Override the default model for Claude Code sessions (sonnet, opus, haiku).',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Effort Level',
    description: 'Controls response effort: low, medium, high, or max.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Verbose Output',
    description: 'Show detailed output during Claude Code sessions.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Max Budget (USD)',
    description: 'Maximum dollar amount to spend per Claude Code session. 0 for unlimited.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Allowed Tools',
    description: 'Comma-separated list of tools Claude is allowed to use.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Disallowed Tools',
    description: 'Comma-separated list of tools Claude is blocked from using.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'System Prompt (Append)',
    description: 'Additional instructions appended to Claude default system prompt.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Additional Directories',
    description: 'Extra directories Claude Code can access beyond the project root.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Chrome Integration',
    description: 'Enable Claude in Chrome browser automation integration.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Git Worktree',
    description: 'Create a new git worktree for each Claude Code session.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Skip Permission Checks',
    description: 'Dangerously bypass all permission checks. Only for sandboxed environments.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },
  {
    label: 'Agent Templates',
    description: 'Pre-configured launch profiles for Claude Code sessions. Edit, add, or remove quick-action templates.',
    section: 'claude',
    sectionLabel: 'Claude Code',
  },

  // ── Keybindings ───────────────────────────────────────────────────────────
  {
    label: 'Open Settings',
    description: 'Keyboard shortcut to open the Settings dialog. Default: Ctrl+,',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Command Palette',
    description: 'Keyboard shortcut to open the Command Palette. Default: Ctrl+Shift+P',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Go to File (Picker)',
    description: 'Keyboard shortcut to open the file picker. Default: Ctrl+P',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Toggle Left Sidebar',
    description: 'Keyboard shortcut to show/hide the left sidebar. Default: Ctrl+B',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Toggle Terminal',
    description: 'Keyboard shortcut to show/hide the terminal panel. Default: Ctrl+J',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Toggle Agent Monitor',
    description: 'Keyboard shortcut to show/hide the Agent Monitor. Default: Ctrl+\\',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'New Terminal Tab',
    description: 'Keyboard shortcut to open a new terminal tab.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Find in File',
    description: 'Keyboard shortcut to search within the currently open file.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Go to Line',
    description: 'Keyboard shortcut to jump to a specific line number.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Toggle Diff View',
    description: 'Keyboard shortcut to toggle the git diff overlay in the file viewer.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Fold All',
    description: 'Keyboard shortcut to collapse all code folds.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Unfold All',
    description: 'Keyboard shortcut to expand all code folds.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },
  {
    label: 'Toggle Word Wrap',
    description: 'Keyboard shortcut to toggle word wrap in the file viewer.',
    section: 'keybindings',
    sectionLabel: 'Keybindings',
  },

  // ── Hooks ─────────────────────────────────────────────────────────────────
  {
    label: 'Hook Scripts Status',
    description: 'Check and reinstall Claude Code hook scripts.',
    section: 'hooks',
    sectionLabel: 'Hooks',
  },
  {
    label: 'Server Transport',
    description: 'Named pipe (Windows) or TCP fallback for hook events.',
    section: 'hooks',
    sectionLabel: 'Hooks',
  },
  {
    label: 'TCP Fallback Port',
    description: 'Port number for the TCP hook server on macOS/Linux (1024–65535). Default: 3333',
    section: 'hooks',
    sectionLabel: 'Hooks',
  },
  {
    label: 'Hook Scripts Location',
    description: 'Directory where Claude Code hook scripts are installed: ~/.claude/hooks/',
    section: 'hooks',
    sectionLabel: 'Hooks',
  },

  // ── Files ──────────────────────────────────────────────────────────────────
  {
    label: 'Custom Ignore Patterns',
    description: 'Add extra file or folder names to ignore in the file tree (e.g. vendor, *.log).',
    section: 'files',
    sectionLabel: 'Files',
  },

  // ── Layouts ──────────────────────────────────────────────────────────────
  {
    label: 'Workspace Layouts',
    description: 'Save and restore panel arrangements for different workflows (monitoring, review, coding). Switch with Ctrl+Alt+1/2/3.',
    section: 'general',
    sectionLabel: 'General',
  },

  // ── Extensions ────────────────────────────────────────────────────────────
  {
    label: 'Installed Extensions',
    description: 'View, enable, disable, and uninstall sandboxed extensions loaded from the extensions directory.',
    section: 'extensions',
    sectionLabel: 'Extensions',
  },
  {
    label: 'Install Extension',
    description: 'Install an extension from a folder containing a manifest.json and entry script.',
    section: 'extensions',
    sectionLabel: 'Extensions',
  },
  {
    label: 'Open Extensions Folder',
    description: 'Open the extensions/ folder inside userData in the system file manager.',
    section: 'extensions',
    sectionLabel: 'Extensions',
  },
  {
    label: 'Extension Commands',
    description: 'Commands registered by extensions at runtime. Appear in the Command Palette under the Extension category.',
    section: 'extensions',
    sectionLabel: 'Extensions',
  },
  {
    label: 'Extension Permissions',
    description: 'Extensions declare permissions in manifest.json: files.read, files.write, terminal.write, config.read, ui.notify, commands.register.',
    section: 'extensions',
    sectionLabel: 'Extensions',
  },

  // ── Code Mode ──────────────────────────────────────────────────────────────
  {
    label: 'Code Mode',
    description: 'Collapse MCP tools into a single execute_code tool with TypeScript types. Reduces context token usage.',
    section: 'codemode',
    sectionLabel: 'Code Mode',
  },
  {
    label: 'Code Mode Server Names',
    description: 'Comma-separated list of MCP server names to proxy through Code Mode.',
    section: 'codemode',
    sectionLabel: 'Code Mode',
  },

  // ── Language Server Protocol (LSP) ────────────────────────────────────────
  {
    label: 'Enable LSP',
    description: 'Enable Language Server Protocol integration for code intelligence (completions, diagnostics, hover, go-to-definition).',
    section: 'general',
    sectionLabel: 'General',
  },
  {
    label: 'Custom Language Servers',
    description: 'Configure custom language server commands per language. For example, use "rust-analyzer" for Rust or "pylsp" for Python.',
    section: 'general',
    sectionLabel: 'General',
  },

  // ── MCP Servers ────────────────────────────────────────────────────────────
  {
    label: 'MCP Servers',
    description: 'Configure Model Context Protocol servers that provide additional tools and capabilities to Claude Code.',
    section: 'mcp',
    sectionLabel: 'MCP Servers',
  },
  {
    label: 'Add MCP Server',
    description: 'Add a new MCP server with command, arguments, environment variables, and scope (global or project).',
    section: 'mcp',
    sectionLabel: 'MCP Servers',
  },
  {
    label: 'MCP Server Scope',
    description: 'Global servers are available in all projects. Project servers are specific to the current project.',
    section: 'mcp',
    sectionLabel: 'MCP Servers',
  },
]
