import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Slash command definitions ────────────────────────────────────────────────

export interface SlashCommand {
  /** Unique identifier, e.g. 'clear' (user types /clear). */
  id: string;
  /** Display label in the menu. */
  label: string;
  /** Short description shown next to the label. */
  description: string;
  /** Category icon or glyph. */
  icon: string;
  /** The action to run when selected. Return true to also clear the draft. */
  action: () => void;
  /** If true, clear the draft after executing. Defaults to true. */
  clearDraft?: boolean;
}

export interface SlashCommandMenuProps {
  query: string;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function SlashCommandMenu({
  query,
  commands,
  onSelect,
  onClose,
  isOpen,
}: SlashCommandMenuProps): React.ReactElement | null {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.id.toLowerCase().includes(q) ||
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    );
  }, [query, commands]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-slash-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Global keyboard handler (capture phase, same pattern as MentionAutocomplete)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[selectedIndex]);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [isOpen, filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[320px] overflow-y-auto rounded-lg border shadow-lg"
      style={{
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        Slash Commands
      </div>
      {filtered.map((cmd, index) => (
        <button
          key={cmd.id}
          data-slash-item
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-75"
          style={{
            backgroundColor:
              index === selectedIndex
                ? 'var(--bg-hover, var(--border))'
                : 'transparent',
            color: 'var(--text)',
          }}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            onSelect(cmd);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px]"
            style={{
              backgroundColor: 'var(--bg-elevated, var(--border))',
              color: 'var(--text-muted)',
            }}
          >
            {cmd.icon}
          </span>
          <span className="font-medium" style={{ color: 'var(--accent)' }}>
            /{cmd.id}
          </span>
          <span className="truncate" style={{ color: 'var(--text-muted)' }}>
            {cmd.description}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Built-in slash commands ──────────────────────────────────────────────────

function dispatchIdeEvent(eventName: string, detail?: string): void {
  window.dispatchEvent(
    new CustomEvent(eventName, detail ? { detail } : undefined),
  );
}

export interface SlashCommandContext {
  onClearChat?: () => void;
  onCompactChat?: () => void;
  onNewThread?: () => void;
}

export function buildChatSlashCommands(ctx: SlashCommandContext): SlashCommand[] {
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
      action: () => { /* handled via onSelect in composer — adds @diff mention */ },
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
  ];
}
