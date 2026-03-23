import Fuse from 'fuse.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProjectFileIndex } from '../../hooks/useProjectFileIndex';
import type { FileEntry } from '../FileTree/FileListItem';
import { FilePickerItem } from './FilePickerItem';
import { PaletteAnimations } from './paletteAnimations';
import { PaletteFooter } from './PaletteOverlay';
import { PickerInput,PickerOverlay } from './PickerOverlay';

const MAX_RESULTS = 30;
const ITEM_HEIGHT = 36;
const MAX_VISIBLE = 12;

const FUSE_OPTIONS = {
  keys: [{ name: 'name', weight: 0.6 }, { name: 'relativePath', weight: 0.4 }],
  threshold: 0.4, distance: 200, minMatchCharLength: 1, includeScore: true, includeMatches: true,
};

type MatchResult = {
  entry: FileEntry;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
};

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

type PickerKeyboardConfig = {
  matches: MatchResult[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  handleSelect: (entry: FileEntry) => void;
  onClose: () => void;
};

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

function FileList({ listRef, matches, selectedIndex, emptyLabel, onSelect, onHover }: {
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
      {matches.length === 0 ? (
        <div className="text-text-semantic-muted" style={{ padding: '16px 14px', fontSize: '13px', textAlign: 'center' }}>
          {emptyLabel}
        </div>
      ) : (
        matches.map((match, idx) => (
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
        ))
      )}
    </div>
  );
}

function useFilePickerState(props: FilePickerProps) {
  const { actionLabel, isOpen, label, onClose, onSelectFile, placeholder, prefix, projectRoot } =
    resolveFilePickerProps(props);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { allFiles, isLoading: isScanning } = useProjectFileIndex({
    roots: projectRoot ? [projectRoot] : [],
    enabled: isOpen && !!projectRoot,
  });

  useResetOnOpen(isOpen, inputRef, setQuery, setSelectedIndex);

  const fuse = useMemo(() => new Fuse(allFiles, FUSE_OPTIONS), [allFiles]);
  const matches = useFileMatches(query, fuse, allFiles);

  useClampIndex(matches.length, setSelectedIndex);
  useScrollIntoView(listElement, selectedIndex);

  const handleSelect = useFileSelection(onClose, onSelectFile);
  const handleKeyDown = usePickerKeyboard({ matches, selectedIndex, setSelectedIndex, handleSelect, onClose });
  const handleQueryChange = useQueryChange(setQuery, setSelectedIndex);

  return buildFilePickerState({
    actionLabel,
    allFiles,
    handleKeyDown,
    handleQueryChange,
    handleSelect,
    inputRef,
    isScanning,
    label,
    matches,
    placeholder,
    prefix,
    projectRoot,
    query,
    selectedIndex,
    setListElement,
    setSelectedIndex,
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
    actionLabel: args.actionLabel,
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

function useFileMatches(query: string, fuse: Fuse<FileEntry>, allFiles: FileEntry[]): MatchResult[] {
  return useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      return allFiles.slice(0, MAX_RESULTS).map((entry) => ({
        entry,
        nameIndices: [] as ReadonlyArray<readonly [number, number]>,
        pathIndices: [] as ReadonlyArray<readonly [number, number]>,
      }));
    }

    return fuse.search(trimmed, { limit: MAX_RESULTS }).map((result) => ({
      entry: result.item,
      nameIndices: (result.matches?.find((match) => match.key === 'name')?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
      pathIndices: (result.matches?.find((match) => match.key === 'relativePath')?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
    }));
  }, [query, fuse, allFiles]);
}

function useClampIndex(
  length: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): void {
  useEffect(() => {
    setSelectedIndex((prev) => (length === 0 ? 0 : Math.min(prev, length - 1)));
  }, [length, setSelectedIndex]);
}

function useScrollIntoView(
  listElement: HTMLDivElement | null,
  selectedIndex: number,
): void {
  useEffect(() => {
    const item = listElement?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [listElement, selectedIndex]);
}

function useFileSelection(
  onClose: () => void,
  onSelectFile: (filePath: string) => void,
): (entry: FileEntry) => void {
  return useCallback((entry: FileEntry) => {
    onClose();
    onSelectFile(entry.path);
  }, [onClose, onSelectFile]);
}

function useQueryChange(
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): (value: string) => void {
  return useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, [setQuery, setSelectedIndex]);
}

function usePickerKeyboard({
  matches,
  selectedIndex,
  setSelectedIndex,
  handleSelect,
  onClose,
}: PickerKeyboardConfig): (event: React.KeyboardEvent<HTMLInputElement>) => void {
  return useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const length = matches.length;
    const handlers: Record<string, () => void> = {
      ArrowDown: () => setSelectedIndex((prev) => (length === 0 ? 0 : (prev + 1) % length)),
      ArrowUp: () => setSelectedIndex((prev) => (length === 0 ? 0 : (prev - 1 + length) % length)),
      Enter: () => { if (matches[selectedIndex]) handleSelect(matches[selectedIndex].entry); },
      Escape: () => onClose(),
    };

    const handler = handlers[event.key];
    if (!handler) return;

    event.preventDefault();
    handler();
  }, [matches, selectedIndex, setSelectedIndex, handleSelect, onClose]);
}

function getFooterHints(fileCount: number, actionLabel: string): string[] {
  const hints = ['↑↓ navigate', `↵ ${actionLabel}`, 'esc close'];
  return fileCount > 0 ? [...hints, `${fileCount} files`] : hints;
}

function getEmptyLabel(projectRoot: string | null, isScanning: boolean, query: string): string {
  if (!projectRoot) return 'No project open';
  if (isScanning) return 'Scanning project files...';
  if (query.trim()) return 'No files matched';
  return 'No files found';
}
