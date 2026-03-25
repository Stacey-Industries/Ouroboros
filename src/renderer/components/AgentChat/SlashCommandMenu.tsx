import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SkillDefinition } from '../../../shared/types/rulesAndSkills';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: () => void;
  clearDraft?: boolean;
}

export interface SlashCommandMenuProps {
  query: string;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  isOpen: boolean;
}

function dispatchIdeEvent(eventName: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
}

function filterCommands(query: string, commands: SlashCommand[]): SlashCommand[] {
  const q = query.toLowerCase();
  return commands.filter((cmd) => cmd.id.toLowerCase().includes(q) || cmd.label.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q));
}

function useSlashCommandMoveSelection(
  filtered: SlashCommand[],
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): {
  moveDown: () => void;
  moveUp: () => void;
} {
  return {
    moveDown: () => setSelectedIndex((index) => (index + 1) % filtered.length),
    moveUp: () => setSelectedIndex((index) => (index - 1 + filtered.length) % filtered.length),
  };
}

function handleSlashCommandKeyDown(args: {
  event: KeyboardEvent;
  isOpen: boolean;
  filtered: SlashCommand[];
  selectedIndex: number;
  moveDown: () => void;
  moveUp: () => void;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}): void {
  const { event, isOpen, filtered, selectedIndex, moveDown, moveUp, onSelect, onClose } = args;
  if (!isOpen || filtered.length === 0) return;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      event.stopPropagation();
      moveDown();
      break;
    case 'ArrowUp':
      event.preventDefault();
      event.stopPropagation();
      moveUp();
      break;
    case 'Enter':
      if (event.shiftKey) break; /* falls through */
    case 'Tab':
      event.preventDefault();
      event.stopPropagation();
      onSelect(filtered[selectedIndex]);
      break;
    case 'Escape':
      event.preventDefault();
      event.stopPropagation();
      onClose();
      break;
  }
}

function useSlashCommandKeyboard({
  isOpen,
  filtered,
  selectedIndex,
  setSelectedIndex,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  filtered: SlashCommand[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}): (event: KeyboardEvent) => void {
  const { moveDown, moveUp } = useSlashCommandMoveSelection(filtered, setSelectedIndex);
  return useCallback((event: KeyboardEvent) => handleSlashCommandKeyDown({ event, isOpen, filtered, selectedIndex, moveDown, moveUp, onSelect, onClose }), [isOpen, filtered, selectedIndex, moveDown, moveUp, onSelect, onClose]);
}

function SlashCommandItem({ cmd, selected, onMouseDown, onMouseEnter }: { cmd: SlashCommand; selected: boolean; onMouseDown: () => void; onMouseEnter: () => void; }): React.ReactElement {
  return (
    <button data-slash-item onMouseDown={(event) => { event.preventDefault(); onMouseDown(); }} onMouseEnter={onMouseEnter} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-75 text-text-semantic-primary${selected ? ' bg-surface-overlay' : ''}`}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-raised text-[11px] text-text-semantic-muted">{cmd.icon}</span>
      <span className="font-medium text-interactive-accent">/{cmd.id}</span>
      <span className="truncate text-text-semantic-muted">{cmd.description}</span>
    </button>
  );
}

export function SlashCommandMenu({ query, commands, onSelect, onClose, isOpen }: SlashCommandMenuProps): React.ReactElement | null {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterCommands(query, commands), [query, commands]);
  const handleKeyDown = useSlashCommandKeyboard({ isOpen, filtered, selectedIndex, setSelectedIndex, onSelect, onClose });

  useEffect(() => setSelectedIndex(0), [filtered.length, query]);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.querySelectorAll('[data-slash-item]')[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div ref={listRef} className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[320px] overflow-y-auto rounded-lg border border-border-semantic bg-surface-base shadow-lg">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-semantic-muted">Slash Commands</div>
      {filtered.map((cmd, index) => <SlashCommandItem key={cmd.id} cmd={cmd} selected={index === selectedIndex} onMouseDown={() => onSelect(cmd)} onMouseEnter={() => setSelectedIndex(index)} />)}
    </div>
  );
}

export interface SlashCommandContext {
  onClearChat?: () => void;
  onCompactChat?: () => void;
  onNewThread?: () => void;
  onRemember?: (content: string) => void;
  onOpenMemories?: () => void;
  skills?: SkillDefinition[];
}

function buildSkillSlashCommands(skills: SkillDefinition[]): SlashCommand[] {
  return skills.map((skill) => ({
    id: `skill:${skill.id}`,
    label: skill.name,
    description: skill.description,
    icon: '⚡',
    action: () => {},
    clearDraft: false,
  }));
}

export function buildChatSlashCommands(ctx: SlashCommandContext): SlashCommand[] {
  const builtIn: SlashCommand[] = [
    { id: 'clear', label: 'Clear', description: 'Clear the conversation', icon: '⌫', action: () => ctx.onClearChat?.() },
    { id: 'compact', label: 'Compact', description: 'Summarize conversation to save context', icon: '◇', action: () => ctx.onCompactChat?.() },
    { id: 'new', label: 'New Thread', description: 'Start a new conversation thread', icon: '+', action: () => ctx.onNewThread?.() },
    { id: 'settings', label: 'Settings', description: 'Open settings panel', icon: '⚙', action: () => dispatchIdeEvent('agent-ide:open-settings') },
    { id: 'terminal', label: 'Terminal', description: 'Open a new terminal tab', icon: '>', action: () => dispatchIdeEvent('agent-ide:new-terminal') },
    { id: 'file', label: 'File', description: 'Open file picker (Ctrl+P)', icon: '◰', action: () => dispatchIdeEvent('agent-ide:open-file-picker') },
    { id: 'context', label: 'Context', description: 'Build project context packet', icon: '⬡', action: () => dispatchIdeEvent('agent-ide:open-context-builder') },
    { id: 'diff', label: 'Diff', description: 'Attach current git diff as context', icon: '±', action: () => {} },
    { id: 'theme', label: 'Theme', description: 'Open theme selector', icon: '◈', action: () => dispatchIdeEvent('agent-ide:open-settings', 'appearance') },
    { id: 'help', label: 'Help', description: 'Show keyboard shortcuts and tips', icon: '?', action: () => dispatchIdeEvent('agent-ide:open-settings', 'keybindings') },
    { id: 'remember', label: 'Remember', description: 'Save a memory for future sessions', icon: '◆', action: () => {}, clearDraft: true },
    { id: 'memories', label: 'Memories', description: 'View stored session memories', icon: '≡', action: () => ctx.onOpenMemories?.(), clearDraft: true },
  ];
  const skillCommands = buildSkillSlashCommands(ctx.skills ?? []);
  return [...builtIn, ...skillCommands];
}
