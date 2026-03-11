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
  section: 'general' | 'appearance' | 'fonts' | 'terminal' | 'keybindings' | 'hooks' | 'profiles' | 'files' | 'extensions'
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

  // ── Extensions ────────────────────────────────────────────────────────────
  {
    label: 'Registered Extensions',
    description: 'View commands registered by extensions via the agent-ide:register-command DOM event.',
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
    label: 'Custom Commands',
    description: 'Extension commands registered at runtime via DOM events appear in the Command Palette under the Extension category.',
    section: 'extensions',
    sectionLabel: 'Extensions',
  },
]
