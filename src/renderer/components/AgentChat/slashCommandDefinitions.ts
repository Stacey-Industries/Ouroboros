/**
 * slashCommandDefinitions.ts — pure data + builders for the slash command list.
 *
 * Extracted from SlashCommandMenu.tsx to keep that file under the 300-line cap.
 * Imports of `SlashCommandContext` and `buildChatSlashCommands` from
 * SlashCommandMenu still work via re-export there.
 */
import type { CommandDefinition } from '../../../shared/types/claudeConfig';
import type { SlashCommand } from './SlashCommandMenu';

export interface SlashCommandContext {
  onClearChat?: () => void;
  onCompactChat?: () => void;
  onNewThread?: () => void;
  onRemember?: (content: string) => void;
  onOpenMemories?: () => void;
  onSpec?: (featureName: string) => void;
  commands?: CommandDefinition[];
  /** Wave 25 Phase C — true when the research.explicit feature flag is on. */
  researchEnabled?: boolean;
}

function dispatchIdeEvent(eventName: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
}

function buildCommandSlashCommands(commands: CommandDefinition[]): SlashCommand[] {
  return commands.map((cmd) => ({
    id: `${cmd.scope}:${cmd.id}`,
    label: cmd.name,
    description: cmd.description,
    icon: cmd.scope === 'user' ? '◈' : '▣',
    action: () => {},
    clearDraft: false,
  }));
}

const RESEARCH_COMMANDS: SlashCommand[] = [
  {
    id: 'research',
    label: 'Research',
    description: 'Research a library or topic and pin the artifact as context',
    icon: '⬡',
    // Intercepted by useResearchIntercept in the composer — action is never called.
    action: () => {},
    clearDraft: true,
  },
  {
    id: 'spec-with-research',
    label: 'Spec with Research',
    description: 'Research first, then generate a spec',
    icon: '✦',
    action: () => {},
    clearDraft: true,
  },
  {
    id: 'implement-with-research',
    label: 'Implement with Research',
    description: 'Research first, then implement',
    icon: '▶',
    action: () => {},
    clearDraft: true,
  },
];

function buildContextualCommands(ctx: SlashCommandContext): SlashCommand[] {
  return [
    {
      id: 'clear',
      label: 'Clear',
      description: 'Clear the conversation',
      icon: '⌫',
      action: () => ctx.onClearChat?.(),
    },
    {
      id: 'compact',
      label: 'Compact',
      description: 'Summarize conversation to save context',
      icon: '◇',
      action: () => ctx.onCompactChat?.(),
    },
    {
      id: 'new',
      label: 'New Thread',
      description: 'Start a new conversation thread',
      icon: '+',
      action: () => ctx.onNewThread?.(),
    },
    {
      id: 'memories',
      label: 'Memories',
      description: 'View stored session memories',
      icon: '≡',
      action: () => ctx.onOpenMemories?.(),
      clearDraft: true,
    },
  ];
}

const STATIC_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'settings',
    label: 'Settings',
    description: 'Open settings panel',
    icon: '⚙',
    action: () => dispatchIdeEvent('agent-ide:open-settings'),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Open a new terminal tab',
    icon: '>',
    action: () => dispatchIdeEvent('agent-ide:new-terminal'),
  },
  {
    id: 'file',
    label: 'File',
    description: 'Open file picker (Ctrl+P)',
    icon: '◰',
    action: () => dispatchIdeEvent('agent-ide:open-file-picker'),
  },
  {
    id: 'context',
    label: 'Context',
    description: 'Build project context packet',
    icon: '⬡',
    action: () => dispatchIdeEvent('agent-ide:open-context-builder'),
  },
  {
    id: 'diff',
    label: 'Diff',
    description: 'Attach current git diff as context',
    icon: '±',
    action: () => {},
  },
  {
    id: 'theme',
    label: 'Theme',
    description: 'Open theme selector',
    icon: '◈',
    action: () => dispatchIdeEvent('agent-ide:open-settings', 'appearance'),
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Show keyboard shortcuts and tips',
    icon: '?',
    action: () => dispatchIdeEvent('agent-ide:open-settings', 'keybindings'),
  },
  {
    id: 'remember',
    label: 'Remember',
    description: 'Save a memory for future sessions',
    icon: '◆',
    action: () => {},
    clearDraft: true,
  },
  {
    id: 'spec',
    label: 'Spec',
    description: 'Scaffold requirements/design/tasks for a feature',
    icon: '✦',
    action: () => {},
    clearDraft: true,
  },
];

export function buildChatSlashCommands(ctx: SlashCommandContext): SlashCommand[] {
  const researchEntries = ctx.researchEnabled !== false ? RESEARCH_COMMANDS : [];
  const commandEntries = buildCommandSlashCommands(ctx.commands ?? []);
  return [
    ...buildContextualCommands(ctx),
    ...STATIC_SLASH_COMMANDS,
    ...researchEntries,
    ...commandEntries,
  ];
}
