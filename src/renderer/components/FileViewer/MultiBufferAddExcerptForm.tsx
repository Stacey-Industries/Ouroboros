import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BufferExcerpt } from '../../types/electron';

export interface AddExcerptFormProps {
  onAdd: (excerpt: BufferExcerpt) => void;
  onCancel: () => void;
  /** Project root used for relative-path resolution and file suggestions */
  projectRoot?: string | null;
}

interface ExcerptFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  autoFocus?: boolean;
  min?: string;
  error?: string | null;
}

interface RangeFieldsProps {
  startLine: string;
  endLine: string;
  setStartLine: (value: string) => void;
  setEndLine: (value: string) => void;
  startError: string | null;
  endError: string | null;
}

const FORM_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: 'var(--surface-panel)', borderBottom: '1px solid var(--border-semantic)', fontFamily: 'var(--font-ui)' };
const FORM_TITLE_STYLE: React.CSSProperties = { fontSize: '0.8125rem', fontWeight: 600 };
const FIELD_LABEL_STYLE: React.CSSProperties = { fontSize: '0.75rem', fontFamily: 'var(--font-ui)', marginBottom: '2px' };
const INPUT_STYLE: React.CSSProperties = { background: 'var(--surface-base)', border: '1px solid var(--border-semantic)', borderRadius: '3px', padding: '4px 8px', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%' };
const INPUT_ERROR_STYLE: React.CSSProperties = { ...INPUT_STYLE, border: '1px solid var(--status-error)' };
const RANGE_FIELDS_STYLE: React.CSSProperties = { display: 'flex', gap: '8px' };
const ACTIONS_STYLE: React.CSSProperties = { display: 'flex', gap: '8px', justifyContent: 'flex-end' };
const CANCEL_BUTTON_STYLE: React.CSSProperties = { background: 'none', border: '1px solid var(--border-semantic)', borderRadius: '3px', padding: '4px 12px', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'var(--font-ui)' };
const SUBMIT_BUTTON_STYLE: React.CSSProperties = { background: 'var(--interactive-accent)', border: 'none', borderRadius: '3px', padding: '4px 12px', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-ui)' };
const SUBMIT_BUTTON_DISABLED_STYLE: React.CSSProperties = { ...SUBMIT_BUTTON_STYLE, opacity: 0.5, cursor: 'default' };
const ERROR_TEXT_STYLE: React.CSSProperties = { fontSize: '0.6875rem', fontFamily: 'var(--font-ui)', marginTop: '2px' };
const SUGGESTION_LIST_STYLE: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '160px', overflowY: 'auto', backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-semantic)', borderTop: 'none', borderRadius: '0 0 3px 3px', zIndex: 100, boxShadow: '0 4px 8px rgba(0,0,0,0.25)' };
const SUGGESTION_ITEM_STYLE: React.CSSProperties = { padding: '4px 8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const SUGGESTION_ITEM_ACTIVE_STYLE: React.CSSProperties = { ...SUGGESTION_ITEM_STYLE, backgroundColor: 'var(--interactive-accent)' };

interface ValidationErrors { filePath: string | null; startLine: string | null; endLine: string | null; }
interface FileSuggestion { path: string; relativePath: string; }
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.cache', '.next', '__pycache__', 'coverage']);

function isInvalidPositiveLine(raw: string, parsed: number): boolean { return raw !== '' && (Number.isNaN(parsed) || parsed < 1); }

async function processSuggestionItem({
  item,
  depth,
  projectRoot,
  suggestions,
  walk,
}: {
  item: { isDirectory: boolean; name: string; path: string };
  depth: number;
  projectRoot: string;
  suggestions: FileSuggestion[];
  walk: (dir: string, nextDepth: number) => Promise<void>;
}): Promise<void> {
  if (suggestions.length >= 2000) return;
  if (item.isDirectory) {
    if (!SKIP_DIRS.has(item.name)) await walk(item.path, depth + 1);
    return;
  }
  suggestions.push({ path: item.path, relativePath: item.path.replace(projectRoot, '').replace(/^[\\/]/, '').replace(/\\/g, '/') });
}

function validateForm(filePath: string, startLine: string, endLine: string): ValidationErrors {
  const errors: ValidationErrors = { filePath: null, startLine: null, endLine: null };
  if (!filePath.trim()) errors.filePath = 'File path is required';
  const start = parseInt(startLine, 10), end = parseInt(endLine, 10);
  if (isInvalidPositiveLine(startLine, start)) errors.startLine = 'Must be a positive number';
  if (isInvalidPositiveLine(endLine, end)) errors.endLine = 'Must be a positive number';
  if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) errors.endLine = 'End line must be >= start line';
  return errors;
}

function createExcerpt(filePath: string, startLine: string, endLine: string, label: string): BufferExcerpt | null {
  if (!filePath.trim()) return null;
  const start = parseInt(startLine, 10), end = parseInt(endLine, 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) return null;
  return { filePath: filePath.trim(), startLine: start, endLine: end, label: label.trim() || undefined };
}

function useFileSuggestions(query: string, projectRoot: string | null | undefined): FileSuggestion[] {
  const [files, setFiles] = useState<FileSuggestion[]>([]);
  const cacheRef = useRef<FileSuggestion[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!projectRoot || loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      try {
        const root = await window.electronAPI.files.readDir(projectRoot);
        if (!root.success || !root.items) return;
        const suggestions: FileSuggestion[] = [];
        const visited = new Set<string>();
        async function walk(dir: string, depth: number): Promise<void> {
          if (depth > 5 || suggestions.length >= 2000 || visited.has(dir)) return;
          visited.add(dir);
          try {
            const res = await window.electronAPI.files.readDir(dir);
            if (!res.success || !res.items) return;
            for (const item of res.items) {
              await processSuggestionItem({ item, depth, projectRoot, suggestions, walk });
              if (suggestions.length >= 2000) return;
            }
          } catch { return; }
        }
        await walk(projectRoot, 0);
        cacheRef.current = suggestions;
        setFiles(suggestions);
      } catch { return; }
    })();
  }, [projectRoot]);

  return useMemo(() => {
    if (!query.trim() || files.length === 0) return [];
    const lower = query.toLowerCase().replace(/\\/g, '/');
    return files.filter((f) => f.relativePath.toLowerCase().includes(lower) || f.path.toLowerCase().replace(/\\/g, '/').includes(lower)).slice(0, 15);
  }, [query, files]);
}

function useExcerptFormState(onAdd: (excerpt: BufferExcerpt) => void) {
  const [filePath, setFilePath] = useState('');
  const [startLine, setStartLine] = useState('1');
  const [endLine, setEndLine] = useState('50');
  const [label, setLabel] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errors = useMemo(() => validateForm(filePath, startLine, endLine), [filePath, startLine, endLine]);
  const hasErrors = errors.filePath !== null || errors.startLine !== null || errors.endLine !== null;
  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    setHasSubmitted(true);
    const excerpt = createExcerpt(filePath, startLine, endLine, label);
    if (!excerpt) { setSubmitError('Please fix the errors above before adding.'); return; }
    setSubmitError(null);
    onAdd(excerpt);
  }, [endLine, filePath, label, onAdd, startLine]);
  return { filePath, startLine, endLine, label, setFilePath, setStartLine, setEndLine, setLabel, handleSubmit, hasSubmitted, submitError, errors, hasErrors };
}

function ExcerptField({ label, value, onChange, placeholder, type = 'text', autoFocus = false, min, error }: ExcerptFieldProps): React.ReactElement {
  return <div><div className="text-text-semantic-muted" style={FIELD_LABEL_STYLE}>{label}</div><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="text-text-semantic-primary" style={error ? INPUT_ERROR_STYLE : INPUT_STYLE} autoFocus={autoFocus} min={min} />{error ? <div className="text-status-error" style={ERROR_TEXT_STYLE}>{error}</div> : null}</div>;
}

function FilePathField({ value, onChange, error, projectRoot }: { value: string; onChange: (value: string) => void; error: string | null; projectRoot: string | null | undefined; }): React.ReactElement {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useFileSuggestions(value, projectRoot);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowSuggestions(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasBrowse = typeof window !== 'undefined' && window.electronAPI && 'dialog' in window.electronAPI;
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((prev) => Math.max(prev - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < suggestions.length) { e.preventDefault(); onChange(suggestions[activeIndex].path); setShowSuggestions(false); setActiveIndex(-1); }
    else if (e.key === 'Escape') { setShowSuggestions(false); setActiveIndex(-1); }
  }, [activeIndex, onChange, showSuggestions, suggestions]);

  const handleBrowse = useCallback(() => {
    if (!window.electronAPI?.dialog) return;
    void (async () => {
      try {
        const result = await (window.electronAPI.dialog as { showOpenDialog: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }> }).showOpenDialog({ properties: ['openFile'], title: 'Select file for excerpt' });
        if (!result.canceled && result.filePaths.length > 0) onChange(result.filePaths[0]);
      } catch { return; }
    })();
  }, [onChange]);

  return <div ref={containerRef} style={{ position: 'relative' }}>
    <div className="text-text-semantic-muted" style={FIELD_LABEL_STYLE}>File path</div>
    <div style={{ display: 'flex', gap: '4px' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <input type="text" value={value} onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); setActiveIndex(-1); }} onFocus={() => setShowSuggestions(true)} onKeyDown={handleKeyDown} placeholder="Type a filename to search..." className="text-text-semantic-primary" style={error ? INPUT_ERROR_STYLE : INPUT_STYLE} autoFocus />
        {showSuggestions && suggestions.length > 0 ? <div style={SUGGESTION_LIST_STYLE}>{suggestions.map((s, i) => <div key={s.path} className={i === activeIndex ? 'text-text-semantic-on-accent' : 'text-text-semantic-primary'} style={i === activeIndex ? SUGGESTION_ITEM_ACTIVE_STYLE : SUGGESTION_ITEM_STYLE} onMouseEnter={() => setActiveIndex(i)} onMouseDown={(e) => { e.preventDefault(); onChange(s.path); setShowSuggestions(false); setActiveIndex(-1); }} title={s.path}>{s.relativePath}</div>)}</div> : null}
      </div>
      {hasBrowse ? <button type="button" onClick={handleBrowse} className="text-text-semantic-muted" style={CANCEL_BUTTON_STYLE} title="Browse for file">Browse...</button> : null}
    </div>
    {error ? <div className="text-status-error" style={ERROR_TEXT_STYLE}>{error}</div> : null}
  </div>;
}

function RangeFields({ startLine, endLine, setStartLine, setEndLine, startError, endError }: RangeFieldsProps): React.ReactElement {
  return <div style={RANGE_FIELDS_STYLE}><div style={{ flex: 1 }}><ExcerptField label="Start line" type="number" value={startLine} onChange={setStartLine} min="1" error={startError} /></div><div style={{ flex: 1 }}><ExcerptField label="End line" type="number" value={endLine} onChange={setEndLine} min="1" error={endError} /></div></div>;
}

function ExcerptActions({ onCancel, disabled }: { onCancel: () => void; disabled: boolean; }): React.ReactElement {
  return <div style={ACTIONS_STYLE}><button type="button" onClick={onCancel} className="text-text-semantic-muted" style={CANCEL_BUTTON_STYLE}>Cancel</button><button type="submit" className="text-text-semantic-on-accent" style={disabled ? SUBMIT_BUTTON_DISABLED_STYLE : SUBMIT_BUTTON_STYLE}>Add Excerpt</button></div>;
}

export const AddExcerptForm = memo(function AddExcerptForm({ onAdd, onCancel, projectRoot }: AddExcerptFormProps): React.ReactElement {
  const form = useExcerptFormState(onAdd);
  const showErrors = form.hasSubmitted;
  return <form onSubmit={form.handleSubmit} style={FORM_STYLE}>
    <div className="text-text-semantic-primary" style={FORM_TITLE_STYLE}>Add Excerpt</div>
    <FilePathField value={form.filePath} onChange={form.setFilePath} error={showErrors ? form.errors.filePath : null} projectRoot={projectRoot} />
    <RangeFields startLine={form.startLine} endLine={form.endLine} setStartLine={form.setStartLine} setEndLine={form.setEndLine} startError={showErrors ? form.errors.startLine : null} endError={showErrors ? form.errors.endLine : null} />
    <ExcerptField label="Label (optional)" value={form.label} onChange={form.setLabel} placeholder="e.g. handleClick" />
    {form.submitError ? <div className="text-status-error" style={ERROR_TEXT_STYLE}>{form.submitError}</div> : null}
    <ExcerptActions onCancel={onCancel} disabled={showErrors && form.hasErrors} />
  </form>;
});
