/**
 * settingsEntries.ts - Static metadata for all settings fields.
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

type EntryDefinition = readonly [label: string, description?: string]
type SettingsSection = SettingsEntry['section']

function createEntries(
  section: SettingsSection,
  sectionLabel: string,
  definitions: readonly EntryDefinition[],
): SettingsEntry[] {
  return definitions.map(([label, description]) => ({ label, description, section, sectionLabel }))
}

const GENERAL_ENTRIES = createEntries('general', 'General', [
  ['Default Project Folder', 'The folder Ouroboros opens by default when no project is loaded.'],
  ['Recent Projects', 'List of recently opened project folders. Clear all recent projects.'],
  ['Auto-install hook scripts', 'Automatically copies Claude Code hook scripts to ~/.claude/hooks/ on launch so Ouroboros receives live tool events.'],
  ['Export Settings', 'Save all settings to a JSON file for backup or sharing.'],
  ['Import Settings', 'Load settings from a previously exported JSON file.'],
  ['Open settings.json', 'Edit settings directly as a JSON file in your system editor.'],
  ['Agent Notifications', 'Desktop notification level for agent completion: all, errors only, or none.'],
  ['Always Notify', 'Show desktop notifications even when the app window is in the foreground.'],
  ['Workspace Layouts', 'Save and restore panel arrangements for different workflows (monitoring, review, coding). Switch with Ctrl+Alt+1/2/3.'],
  ['Enable LSP', 'Enable Language Server Protocol integration for code intelligence (completions, diagnostics, hover, go-to-definition).'],
  ['Custom Language Servers', 'Configure custom language server commands per language. For example, use "rust-analyzer" for Rust or "pylsp" for Python.'],
])

const APPEARANCE_ENTRIES = createEntries('appearance', 'Appearance', [
  ['Theme', 'Choose between retro, modern, warp, cursor, kiro, and custom themes.'],
  ['Background Gradient', 'Show or hide the subtle gradient overlay on the main background.'],
  ['Theme Editor', 'Customize individual color tokens and save as a custom theme.'],
])

const FONT_ENTRIES = createEntries('fonts', 'Fonts', [
  ['UI Font Family', 'Font used for the interface. Leave blank to use the system default.'],
  ['Monospace Font Family', 'Font used for code, file viewer, and terminal UI. Leave blank for the theme default.'],
  ['UI Font Size', 'Base font size for the interface (11-18px).'],
])

const TERMINAL_ENTRIES = createEntries('terminal', 'Terminal', [
  ['Terminal Font Size', 'Font size used inside terminal sessions (10-24px).'],
  ['Default Shell', 'Shell executable path used for new terminal sessions.'],
  ['Shell Prompt', 'Choose a prompt style: Default, Minimal, Git, Powerline, or Custom PS1.'],
  ['Custom Prompt (PS1)', 'Enter a custom PS1 string to use as the shell prompt in terminal sessions.'],
])

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
  ['Skip Permission Checks', 'Dangerously bypass all permission checks. Only for sandboxed environments.'],
  ['Agent Templates', 'Pre-configured launch profiles for Claude Code sessions. Edit, add, or remove quick-action templates.'],
])

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
])

const HOOK_ENTRIES = createEntries('hooks', 'Hooks', [
  ['Hook Scripts Status', 'Check and reinstall Claude Code hook scripts.'],
  ['Server Transport', 'Named pipe (Windows) or TCP fallback for hook events.'],
  ['TCP Fallback Port', 'Port number for the TCP hook server on macOS/Linux (1024-65535). Default: 3333'],
  ['Hook Scripts Location', 'Directory where Claude Code hook scripts are installed: ~/.claude/hooks/'],
])

const FILE_ENTRIES = createEntries('files', 'Files', [
  ['Custom Ignore Patterns', 'Add extra file or folder names to ignore in the file tree (e.g. vendor, *.log).'],
])

const EXTENSION_ENTRIES = createEntries('extensions', 'Extensions', [
  ['Installed Extensions', 'View, enable, disable, and uninstall sandboxed extensions loaded from the extensions directory.'],
  ['Install Extension', 'Install an extension from a folder containing a manifest.json and entry script.'],
  ['Open Extensions Folder', 'Open the extensions/ folder inside userData in the system file manager.'],
  ['Extension Commands', 'Commands registered by extensions at runtime. Appear in the Command Palette under the Extension category.'],
  ['Extension Permissions', 'Extensions declare permissions in manifest.json: files.read, files.write, terminal.write, config.read, ui.notify, commands.register.'],
])

const CODE_MODE_ENTRIES = createEntries('codemode', 'Code Mode', [
  ['Code Mode', 'Collapse MCP tools into a single execute_code tool with TypeScript types. Reduces context token usage.'],
  ['Code Mode Server Names', 'Comma-separated list of MCP server names to proxy through Code Mode.'],
])

const MCP_ENTRIES = createEntries('mcp', 'MCP Servers', [
  ['MCP Servers', 'Configure Model Context Protocol servers that provide additional tools and capabilities to Claude Code.'],
  ['Add MCP Server', 'Add a new MCP server with command, arguments, environment variables, and scope (global or project).'],
  ['MCP Server Scope', 'Global servers are available in all projects. Project servers are specific to the current project.'],
])

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  ...GENERAL_ENTRIES,
  ...APPEARANCE_ENTRIES,
  ...FONT_ENTRIES,
  ...TERMINAL_ENTRIES,
  ...CLAUDE_ENTRIES,
  ...KEYBINDING_ENTRIES,
  ...HOOK_ENTRIES,
  ...FILE_ENTRIES,
  ...EXTENSION_ENTRIES,
  ...CODE_MODE_ENTRIES,
  ...MCP_ENTRIES,
]
