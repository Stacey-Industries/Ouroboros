import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  /** External selectedIndex — when provided (Lexical path), overrides internal state. */
  selectedIndex?: number;
}

function filterCommands(query: string, commands: SlashCommand[]): SlashCommand[] {
  const q = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.id.toLowerCase().includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q),
  );
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

interface SlashCommandKeyArgs {
  event: KeyboardEvent;
  isOpen: boolean;
  filtered: SlashCommand[];
  selectedIndex: number;
  moveDown: () => void;
  moveUp: () => void;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

function stopAndRun(event: KeyboardEvent, fn: () => void): void {
  event.preventDefault();
  event.stopPropagation();
  fn();
}

function handleSlashCommandKeyDown(args: SlashCommandKeyArgs): void {
  const { event, isOpen, filtered, selectedIndex, moveDown, moveUp, onSelect, onClose } = args;
  if (!isOpen || filtered.length === 0) return;
  if (event.key === 'ArrowDown') {
    stopAndRun(event, moveDown);
    return;
  }
  if (event.key === 'ArrowUp') {
    stopAndRun(event, moveUp);
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    stopAndRun(event, () => onSelect(filtered[selectedIndex]));
    return;
  }
  if (event.key === 'Tab') {
    stopAndRun(event, () => onSelect(filtered[selectedIndex]));
    return;
  }
  if (event.key === 'Escape') {
    stopAndRun(event, onClose);
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
  return useCallback(
    (event: KeyboardEvent) =>
      handleSlashCommandKeyDown({
        event,
        isOpen,
        filtered,
        selectedIndex,
        moveDown,
        moveUp,
        onSelect,
        onClose,
      }),
    [isOpen, filtered, selectedIndex, moveDown, moveUp, onSelect, onClose],
  );
}

function SlashCommandItem({
  cmd,
  selected,
  onMouseDown,
  onMouseEnter,
}: {
  cmd: SlashCommand;
  selected: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
}): React.ReactElement {
  return (
    <button
      data-slash-item
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown();
      }}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-75 text-text-semantic-primary${selected ? ' bg-surface-overlay' : ''}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-raised text-[11px] text-text-semantic-muted">
        {cmd.icon}
      </span>
      <span className="font-medium text-interactive-accent">/{cmd.id}</span>
      <span className="truncate text-text-semantic-muted">{cmd.description}</span>
    </button>
  );
}

function useSlashCommandMenuState(props: SlashCommandMenuProps): {
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  listRef: React.RefObject<HTMLDivElement | null>;
  filtered: SlashCommand[];
  handleKeyDown: (e: KeyboardEvent) => void;
} {
  const { query, commands, isOpen, onSelect, onClose } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterCommands(query, commands), [query, commands]);
  const handleKeyDown = useSlashCommandKeyboard({
    isOpen,
    filtered,
    selectedIndex,
    setSelectedIndex,
    onSelect,
    onClose,
  });
  useEffect(() => setSelectedIndex(0), [filtered.length, query]);
  // Sync from external selectedIndex (Lexical path). Legacy path leaves it undefined.
  useEffect(() => {
    if (props.selectedIndex !== undefined) setSelectedIndex(props.selectedIndex);
  }, [props.selectedIndex]);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current
      .querySelectorAll('[data-slash-item]')
      [selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);
  return { selectedIndex, setSelectedIndex, listRef, filtered, handleKeyDown };
}

export function SlashCommandMenu(props: SlashCommandMenuProps): React.ReactElement | null {
  const { selectedIndex, setSelectedIndex, listRef, filtered } = useSlashCommandMenuState(props);
  if (!props.isOpen || filtered.length === 0) return null;
  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[320px] overflow-y-auto rounded-lg border border-border-semantic bg-surface-overlay shadow-xl"
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-semantic-muted">
        Slash Commands
      </div>
      {filtered.map((cmd, index) => (
        <SlashCommandItem
          key={cmd.id}
          cmd={cmd}
          selected={index === selectedIndex}
          onMouseDown={() => props.onSelect(cmd)}
          onMouseEnter={() => setSelectedIndex(index)}
        />
      ))}
    </div>
  );
}

// Slash command definitions + builder live in slashCommandDefinitions.ts; re-exported
// here for backward compatibility with all existing importers.
export { buildChatSlashCommands, type SlashCommandContext } from './slashCommandDefinitions';
