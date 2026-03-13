import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Fuse from 'fuse.js';
import { PaletteAnimations } from './paletteAnimations';
import { PickerOverlay, PickerInput } from './PickerOverlay';
import { PaletteFooter } from './PaletteOverlay';
import { FilePickerItem } from './FilePickerItem';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RESULTS = 30;
const ITEM_HEIGHT = 36;
const MAX_VISIBLE = 12;

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'out',
  '__pycache__', '.next', '.cache', 'coverage', 'build',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function relPath(root: string, absPath: string): string {
  const rn = normPath(root);
  const an = normPath(absPath);
  return an.startsWith(rn) ? an.slice(rn.length).replace(/^\//, '') : an;
}

async function scanFilesRecursive(root: string, dirPath: string, files: FileEntry[], maxFiles: number): Promise<void> {
  if (files.length >= maxFiles) return;
  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) return;

  const dirs: string[] = [];
  for (const item of result.items) {
    if (files.length >= maxFiles) break;
    if (item.isDirectory) {
      if (!IGNORED_DIRS.has(item.name)) dirs.push(item.path);
    } else {
      files.push({ name: item.name, path: item.path, relativePath: relPath(root, item.path) });
    }
  }
  for (const dir of dirs) {
    if (files.length >= maxFiles) break;
    await scanFilesRecursive(root, dir, files, maxFiles);
  }
}

// ─── Fuse config ─────────────────────────────────────────────────────────────

const FUSE_OPTIONS: Fuse.IFuseOptions<FileEntry> = {
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'relativePath', weight: 0.4 },
  ],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

type MatchResult = {
  entry: FileEntry;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
};

// ─── FilePicker ─────────────────────────────────────────────────────────────

export interface FilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
  onOpenFile: (filePath: string) => void;
}

export function FilePicker({ isOpen, onClose, projectRoot, onOpenFile }: FilePickerProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useScanFiles(isOpen, projectRoot, setAllFiles, setIsScanning);
  useResetOnOpen(isOpen, inputRef, setQuery, setSelectedIndex);

  const fuse = useMemo(() => new Fuse(allFiles, FUSE_OPTIONS), [allFiles]);
  const matches = useFileMatches(query, fuse, allFiles);

  useClampIndex(matches.length, setSelectedIndex);
  useScrollIntoView(listRef, selectedIndex);

  const handleSelect = useCallback((entry: FileEntry) => {
    onClose();
    onOpenFile(entry.path);
  }, [onClose, onOpenFile]);

  const handleKeyDown = usePickerKeyboard(matches, selectedIndex, setSelectedIndex, handleSelect, onClose);

  const handleQueryChange = useCallback((v: string) => {
    setQuery(v);
    setSelectedIndex(0);
  }, []);

  if (!isOpen) return null;

  const emptyLabel = getEmptyLabel(projectRoot, isScanning, query);
  const footerHints = ['↑↓ navigate', '↵ open', 'esc close'];

  return (
    <>
      <PaletteAnimations prefix="fp" />
      <PickerOverlay label="File Picker" animPrefix="fp" maxWidth="560px" onClose={onClose}>
        <PickerInput
          inputRef={inputRef}
          prefix="#"
          placeholder="Go to file..."
          value={query}
          isOpen={isOpen}
          controlsId="fp-listbox"
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          statusText={isScanning ? 'scanning...' : undefined}
        />
        <FileList
          listRef={listRef}
          matches={matches}
          selectedIndex={selectedIndex}
          emptyLabel={emptyLabel}
          onSelect={handleSelect}
          onHover={setSelectedIndex}
        />
        <PaletteFooter hints={allFiles.length > 0 ? [...footerHints, `${allFiles.length} files`] : footerHints} />
      </PickerOverlay>
    </>
  );
}

// ─── FileList sub-component ──────────────────────────────────────────────────

function FileList({ listRef, matches, selectedIndex, emptyLabel, onSelect, onHover }: {
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: MatchResult[];
  selectedIndex: number;
  emptyLabel: string;
  onSelect: (entry: FileEntry) => void;
  onHover: (idx: number) => void;
}): React.ReactElement {
  return (
    <div id="fp-listbox" role="listbox" aria-label="Files" ref={listRef} style={{ maxHeight: `${ITEM_HEIGHT * MAX_VISIBLE}px`, overflowY: 'auto', padding: '4px 0' }}>
      {matches.length === 0 ? (
        <div style={{ padding: '16px 14px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>{emptyLabel}</div>
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

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useScanFiles(isOpen: boolean, projectRoot: string | null, setAllFiles: (f: FileEntry[]) => void, setIsScanning: (v: boolean) => void): void {
  useEffect(() => {
    if (!isOpen || !projectRoot) return;
    let cancelled = false;
    setIsScanning(true);
    const files: FileEntry[] = [];
    scanFilesRecursive(projectRoot, projectRoot, files, 10000)
      .then(() => { if (!cancelled) { setAllFiles(files); setIsScanning(false); } })
      .catch(() => { if (!cancelled) setIsScanning(false); });
    return () => { cancelled = true; };
  }, [isOpen, projectRoot, setAllFiles, setIsScanning]);
}

function useResetOnOpen(isOpen: boolean, inputRef: React.RefObject<HTMLInputElement | null>, setQuery: (v: string) => void, setSelectedIndex: (v: number) => void): void {
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
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
    return fuse.search(trimmed, { limit: MAX_RESULTS }).map((r) => ({
      entry: r.item,
      nameIndices: (r.matches?.find((m) => m.key === 'name')?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
      pathIndices: (r.matches?.find((m) => m.key === 'relativePath')?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
    }));
  }, [query, fuse, allFiles]);
}

function useClampIndex(length: number, setSelectedIndex: React.Dispatch<React.SetStateAction<number>>): void {
  useEffect(() => {
    setSelectedIndex((prev) => (length === 0 ? 0 : Math.min(prev, length - 1)));
  }, [length, setSelectedIndex]);
}

function useScrollIntoView(listRef: React.RefObject<HTMLDivElement | null>, selectedIndex: number): void {
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, listRef]);
}

function usePickerKeyboard(
  matches: MatchResult[],
  selectedIndex: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  handleSelect: (entry: FileEntry) => void,
  onClose: () => void,
): (e: React.KeyboardEvent<HTMLInputElement>) => void {
  return useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const len = matches.length;
    const handlers: Record<string, () => void> = {
      ArrowDown: () => setSelectedIndex((p) => (len === 0 ? 0 : (p + 1) % len)),
      ArrowUp: () => setSelectedIndex((p) => (len === 0 ? 0 : (p - 1 + len) % len)),
      Enter: () => { if (matches[selectedIndex]) handleSelect(matches[selectedIndex].entry); },
      Escape: () => onClose(),
    };
    const handler = handlers[e.key];
    if (handler) { e.preventDefault(); handler(); }
  }, [matches, selectedIndex, setSelectedIndex, handleSelect, onClose]);
}

function getEmptyLabel(projectRoot: string | null, isScanning: boolean, query: string): string {
  if (!projectRoot) return 'No project open';
  if (isScanning) return 'Scanning project files...';
  if (query.trim()) return 'No files matched';
  return 'No files found';
}
