/**
 * settingsEntriesData.ts - Second half of settings entry definitions.
 * Split from settingsEntries.ts to stay under the 300-line file limit.
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

export const KEYBINDING_ENTRIES = createEntries('keybindings', 'Keybindings', [
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

export const HOOK_ENTRIES = createEntries('hooks', 'Hooks', [
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

export const FILE_ENTRIES = createEntries('files', 'Files', [
  [
    'Custom Ignore Patterns',
    'Add extra file or folder names to ignore in the file tree (e.g. vendor, *.log).',
  ],
]);

export const EXTENSION_ENTRIES = createEntries('integrations', 'Integrations', [
  [
    'Extensions',
    'Browse, install, enable, disable, and uninstall themes, grammars, and snippets from Open VSX and VS Code Marketplace.',
  ],
  [
    'Extension Permissions',
    'Extensions declare permissions in manifest.json: files.read, files.write, terminal.write, config.read, ui.notify, commands.register.',
  ],
]);

export const CODE_MODE_ENTRIES = createEntries('codemode', 'Code Mode', [
  [
    'Code Mode',
    'Collapse MCP tools into a single execute_code tool with TypeScript types. Reduces context token usage.',
  ],
  [
    'Code Mode Server Names',
    'Comma-separated list of MCP server names to proxy through Code Mode.',
  ],
]);

export const CONTEXT_DOCS_ENTRIES = createEntries('contextDocs', 'Context Docs', [
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

export const MCP_ENTRIES = createEntries('integrations', 'Integrations', [
  [
    'MCP Servers',
    'Discover, install, and configure Model Context Protocol servers that provide additional tools and capabilities to Claude Code.',
  ],
  [
    'MCP Server Scope',
    'Global servers are available in all projects. Project servers are specific to the current project.',
  ],
]);
