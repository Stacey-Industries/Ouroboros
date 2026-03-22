import React from 'react';
import { CommandItem } from './CommandItem';
import { CategoryHeader } from './PaletteOverlay';
import { categoryLabel, groupByCategory } from './commandSearch';
import type { Command, CommandMatch } from './types';

const listStyle: React.CSSProperties = {
  maxHeight: '360px',
  overflowY: 'auto',
  padding: '4px 0',
};

const emptyStateStyle: React.CSSProperties = {
  padding: '16px 14px',
  fontSize: '13px',
  textAlign: 'center',
};

interface CommandPaletteResultsProps {
  emptyLabel: string;
  grouped: ReturnType<typeof groupByCategory>;
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: CommandMatch[];
  onExecute: (command: Command) => Promise<void>;
  onMouseEnter: (command: Command) => void;
  selectedIndex: number;
  showHeaders: boolean;
}

export function CommandPaletteResults({
  emptyLabel,
  grouped,
  listRef,
  matches,
  onExecute,
  onMouseEnter,
  selectedIndex,
  showHeaders,
}: CommandPaletteResultsProps): React.ReactElement {
  if (matches.length === 0) {
    return <EmptyResults emptyLabel={emptyLabel} listRef={listRef} />;
  }

  const content = showHeaders
    ? (
      <GroupedResults
        grouped={grouped}
        matches={matches}
        onExecute={onExecute}
        onMouseEnter={onMouseEnter}
        selectedIndex={selectedIndex}
      />
    )
    : (
      <FlatResults
        matches={matches}
        onExecute={onExecute}
        onMouseEnter={onMouseEnter}
        selectedIndex={selectedIndex}
      />
    );

  return <ResultsContainer listRef={listRef}>{content}</ResultsContainer>;
}

function EmptyResults({
  emptyLabel,
  listRef,
}: {
  emptyLabel: string;
  listRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactElement {
  return (
    <ResultsContainer listRef={listRef}>
      <div className="text-text-semantic-muted" style={emptyStateStyle}>{emptyLabel}</div>
    </ResultsContainer>
  );
}

function ResultsContainer({
  children,
  listRef,
}: {
  children: React.ReactNode;
  listRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactElement {
  return (
    <div id="cp-listbox" role="listbox" aria-label="Commands" ref={listRef} style={listStyle}>
      {children}
    </div>
  );
}

function GroupedResults({
  grouped,
  matches,
  onExecute,
  onMouseEnter,
  selectedIndex,
}: {
  grouped: ReturnType<typeof groupByCategory>;
  matches: CommandMatch[];
  onExecute: (command: Command) => Promise<void>;
  onMouseEnter: (command: Command) => void;
  selectedIndex: number;
}): React.ReactElement {
  return (
    <>
      {grouped.map((section) => (
        <div key={section.category}>
          <CategoryHeader label={categoryLabel(section.category)} />
          {section.matches.map((match) => (
            <CommandRow
              key={match.command.id}
              match={match}
              matches={matches}
              onExecute={onExecute}
              onMouseEnter={onMouseEnter}
              selectedIndex={selectedIndex}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function FlatResults({
  matches,
  onExecute,
  onMouseEnter,
  selectedIndex,
}: {
  matches: CommandMatch[];
  onExecute: (command: Command) => Promise<void>;
  onMouseEnter: (command: Command) => void;
  selectedIndex: number;
}): React.ReactElement {
  return (
    <>
      {matches.map((match, index) => (
        <CommandRow
          key={match.command.id}
          explicitIndex={index}
          match={match}
          matches={matches}
          onExecute={onExecute}
          onMouseEnter={onMouseEnter}
          selectedIndex={selectedIndex}
        />
      ))}
    </>
  );
}

function CommandRow({
  explicitIndex,
  match,
  matches,
  onExecute,
  onMouseEnter,
  selectedIndex,
}: {
  explicitIndex?: number;
  match: CommandMatch;
  matches: CommandMatch[];
  onExecute: (command: Command) => Promise<void>;
  onMouseEnter: (command: Command) => void;
  selectedIndex: number;
}): React.ReactElement {
  const index = explicitIndex ?? matches.findIndex((item) => item.command.id === match.command.id);

  return (
    <div data-idx={index}>
      <CommandItem
        command={match.command}
        isSelected={index === selectedIndex}
        matchIndices={match.matchIndices}
        onSelect={onExecute}
        onMouseEnter={onMouseEnter}
      />
    </div>
  );
}
