import Fuse from 'fuse.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useProjectFileIndex } from '../../hooks/useProjectFileIndex';
import type { FileEntry } from '../FileTree/FileListItem';
import {
  FUSE_OPTIONS,
  getEmptyLabel,
  getFooterHints,
  type MatchResult,
  type PickerKeyboardConfig,
  useClampIndex,
  useFileMatches,
  useFileSelection,
  usePickerKeyboard,
  useQueryChange,
  useScrollIntoView,
} from './FilePicker.hooks';
import { FilePickerItem } from './FilePickerItem';
import { PaletteAnimations } from './paletteAnimations';
import { PaletteFooter } from './PaletteOverlay';
import { PickerInput, PickerOverlay } from './PickerOverlay';

const ITEM_HEIGHT = 36;
const MAX_VISIBLE = 12;

export interface FilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
  onSelectFile: (filePath: string) => void;
  actionLabel?: string;
  label?: string;
  placeholder?: string;
  prefix?: string;
}

interface ResolvedFilePickerProps {
  actionLabel: string;
  isOpen: boolean;
  label: string;
  onClose: () => void;
  onSelectFile: (filePath: string) => void;
  placeholder: string;
  prefix: string;
  projectRoot: string | null;
}

export function FilePicker(props: FilePickerProps): React.ReactElement | null {
  const { isOpen, onClose } = props;
  const picker = useFilePickerState(props);

  if (!isOpen) return null;

  return (
    <>
      <PaletteAnimations prefix="fp" />
      <PickerOverlay label={picker.label} animPrefix="fp" maxWidth="560px" onClose={onClose}>
        <PickerInput
          inputRef={picker.inputRef}
          prefix={picker.prefix}
          placeholder={picker.placeholder}
          value={picker.query}
          isOpen={isOpen}
          controlsId="fp-listbox"
          onChange={picker.handleQueryChange}
          onKeyDown={picker.handleKeyDown}
          statusText={picker.isScanning ? 'scanning...' : undefined}
        />
        <FileList
          listRef={picker.listRef}
          matches={picker.matches}
          selectedIndex={picker.selectedIndex}
          emptyLabel={picker.emptyLabel}
          onSelect={picker.handleSelect}
          onHover={picker.setSelectedIndex}
        />
        <PaletteFooter hints={picker.footerHints} />
      </PickerOverlay>
    </>
  );
}

function FileListItems({
  matches,
  selectedIndex,
  emptyLabel,
  onSelect,
  onHover,
}: {
  matches: MatchResult[];
  selectedIndex: number;
  emptyLabel: string;
  onSelect: (entry: FileEntry) => void;
  onHover: (idx: number) => void;
}): React.ReactElement {
  if (matches.length === 0) {
    return (
      <div
        className="text-text-semantic-muted"
        style={{ padding: '16px 14px', fontSize: '13px', textAlign: 'center' }}
      >
        {emptyLabel}
      </div>
    );
  }
  return (
    <>
      {matches.map((match, idx) => (
        <FilePickerItem
          key={match.entry.path}
          name={match.entry.name}
          relativePath={match.entry.relativePath}
          isSelected={idx === selectedIndex}
          nameIndices={match.nameIndices}
          pathIndices={match.pathIndices}
          onClick={() => onSelect(match.entry)}
          onMouseEnter={() => onHover(idx)}
        />
      ))}
    </>
  );
}

function FileList({
  listRef,
  matches,
  selectedIndex,
  emptyLabel,
  onSelect,
  onHover,
}: {
  listRef: (node: HTMLDivElement | null) => void;
  matches: MatchResult[];
  selectedIndex: number;
  emptyLabel: string;
  onSelect: (entry: FileEntry) => void;
  onHover: (idx: number) => void;
}): React.ReactElement {
  return (
    <div
      id="fp-listbox"
      role="listbox"
      aria-label="Files"
      ref={listRef}
      style={{ maxHeight: `${ITEM_HEIGHT * MAX_VISIBLE}px`, overflowY: 'auto', padding: '4px 0' }}
    >
      <FileListItems
        matches={matches}
        selectedIndex={selectedIndex}
        emptyLabel={emptyLabel}
        onSelect={onSelect}
        onHover={onHover}
      />
    </div>
  );
}

function useResetOnOpen(
  isOpen: boolean,
  inputRef: React.RefObject<HTMLInputElement | null>,
  setQuery: (value: string) => void,
  setSelectedIndex: (value: number) => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen, inputRef, setQuery, setSelectedIndex]);
}

function useFileSearch(
  query: string,
  projectRoot: string | null,
  isOpen: boolean,
): { allFiles: FileEntry[]; isScanning: boolean; matches: MatchResult[] } {
  const { allFiles, isIndexing: isScanning } = useProjectFileIndex({
    roots: projectRoot ? [projectRoot] : [],
    enabled: isOpen && !!projectRoot,
  });
  const fuse = useMemo(() => new Fuse(allFiles, FUSE_OPTIONS), [allFiles]);
  const matches = useFileMatches(query, fuse, allFiles);
  return { allFiles, isScanning, matches };
}

function useFilePickerState(props: FilePickerProps) {
  const { actionLabel, isOpen, label, onClose, onSelectFile, placeholder, prefix, projectRoot } =
    resolveFilePickerProps(props);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { allFiles, isScanning, matches } = useFileSearch(query, projectRoot, isOpen);

  useResetOnOpen(isOpen, inputRef, setQuery, setSelectedIndex);
  useClampIndex(matches.length, setSelectedIndex);
  useScrollIntoView(listElement, selectedIndex);

  const handleSelect = useFileSelection(onClose, onSelectFile);
  const handleKeyDown = usePickerKeyboard({
    matches,
    selectedIndex,
    setSelectedIndex,
    handleSelect,
    onClose,
  } as PickerKeyboardConfig);
  const handleQueryChange = useQueryChange(setQuery, setSelectedIndex);

  return buildFilePickerState({
    actionLabel, allFiles, handleKeyDown, handleQueryChange, handleSelect,
    inputRef, isScanning, label, matches, placeholder, prefix, projectRoot,
    query, selectedIndex, setListElement, setSelectedIndex,
  });
}

function resolveFilePickerProps(props: FilePickerProps): ResolvedFilePickerProps {
  return {
    actionLabel: props.actionLabel ?? 'open',
    isOpen: props.isOpen,
    label: props.label ?? 'File Picker',
    onClose: props.onClose,
    onSelectFile: props.onSelectFile,
    placeholder: props.placeholder ?? 'Go to file...',
    prefix: props.prefix ?? '#',
    projectRoot: props.projectRoot,
  };
}

function buildFilePickerState(args: {
  actionLabel: string;
  allFiles: FileEntry[];
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleQueryChange: (value: string) => void;
  handleSelect: (entry: FileEntry) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isScanning: boolean;
  label: string;
  matches: MatchResult[];
  placeholder: string;
  prefix: string;
  projectRoot: string | null;
  query: string;
  selectedIndex: number;
  setListElement: (node: HTMLDivElement | null) => void;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  return {
    label: args.label,
    query: args.query,
    selectedIndex: args.selectedIndex,
    isScanning: args.isScanning,
    matches: args.matches,
    inputRef: args.inputRef,
    listRef: args.setListElement,
    emptyLabel: getEmptyLabel(args.projectRoot, args.isScanning, args.query),
    footerHints: getFooterHints(args.allFiles.length, args.actionLabel),
    handleSelect: args.handleSelect,
    handleKeyDown: args.handleKeyDown,
    handleQueryChange: args.handleQueryChange,
    placeholder: args.placeholder,
    prefix: args.prefix,
    setSelectedIndex: args.setSelectedIndex,
  };
}
