import type { Command } from '../../CommandPalette/types';

/**
 * Commands that target IDE-shell-only surfaces and become no-ops in chat-only
 * (and chat-workbench) mode. The chat shell does not listen for the matching
 * `agent-ide:toggle-*` events and has no editor split or in-shell git review
 * surface, so showing these in the palette would mislead the user.
 *
 * Wave 46 Phase F: filter commands by shell capability.
 */
const CHAT_ONLY_DISABLED_COMMAND_IDS: ReadonlySet<string> = new Set([
  'view:toggle-sidebar',
  'view:toggle-agent-monitor',
  'view:split-editor',
  'git:time-travel',
  'git:review-all-changes',
  'git:review-unstaged-changes',
]);

export function filterCommandsForChatShell(commands: readonly Command[]): Command[] {
  return commands.filter((command) => !CHAT_ONLY_DISABLED_COMMAND_IDS.has(command.id));
}

export const __chatOnlyDisabledCommandIds: ReadonlySet<string> = CHAT_ONLY_DISABLED_COMMAND_IDS;
