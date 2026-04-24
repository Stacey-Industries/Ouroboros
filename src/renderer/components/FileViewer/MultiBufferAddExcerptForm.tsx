import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BufferExcerpt } from '../../types/electron';
import type { FilePathKeyDownOptions } from './MultiBufferAddExcerptForm.helpers';
import {
  ACTIONS_STYLE,
  CANCEL_BUTTON_STYLE,
  createExcerpt,
  ERROR_TEXT_STYLE,
  FIELD_LABEL_STYLE,
  type FileSuggestion,
  FORM_STYLE,
  FORM_TITLE_STYLE,
  INPUT_ERROR_STYLE,
  INPUT_STYLE,
  processSuggestionItem,
  RANGE_FIELDS_STYLE,
  resolveDialogApi,
  SUBMIT_BUTTON_DISABLED_STYLE,
  SUBMIT_BUTTON_STYLE,
  SUGGESTION_ITEM_ACTIVE_STYLE,
  SUGGESTION_ITEM_STYLE,
  SUGGESTION_LIST_STYLE,
  validateForm,
} from './MultiBufferAddExcerptForm.helpers';

export interface AddExcerptFormProps {
  onAdd: (excerpt: BufferExcerpt) => void;
  onCancel: () => void;
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

function useSuggestionLoader(
  projectRoot: string | null | undefined,
  setFiles: React.Dispatch<React.SetStateAction<FileSuggestion[]>>,
): void {
  const loadedRef = useRef(false);
  const cacheRef = useRef<FileSuggestion[]>([]);
  useEffect(() => {
    if (!projectRoot || loadedRef.current) return;
    loadedRef.current = true;
    const resolvedRoot = projectRoot;
    void (async () => {
      try {
        const root = await window.electronAPI.files.readDir(resolvedRoot);
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
              await processSuggestionItem({ item, depth, projectRoot: resolvedRoot, suggestions, walk });
              if (suggestions.length >= 2000) return;
            }
          } catch { return; }
        }
        await walk(projectRoot, 0);
        cacheRef.current = suggestions;
        setFiles(suggestions);
      } catch { return; }
    })();
  }, [projectRoot, setFiles]);
}

function useFileSuggestions(query: string, projectRoot: string | null | undefined): FileSuggestion[] {
  const [files, setFiles] = useState<FileSuggestion[]>([]);
  useSuggestionLoader(projectRoot, setFiles);
  return useMemo(() => {
    if (!query.trim() || files.length === 0) return [];
    const lower = query.toLowerCase().replace(/\\/g, '/');
    return files
      .filter((f) => f.relativePath.toLowerCase().includes(lower) || f.path.toLowerCase().replace(/\\/g, '/').includes(lower))
      .slice(0, 15);
  }, [query, files]);
}

function useFormFields() {
  const [filePath, setFilePath] = useState('');
  const [startLine, setStartLine] = useState('1');
  const [endLine, setEndLine] = useState('50');
  const [label, setLabel] = useState('');
  return { filePath, setFilePath, startLine, setStartLine, endLine, setEndLine, label, setLabel };
}

function useExcerptFormState(onAdd: (excerpt: BufferExcerpt) => void) {
  const fields = useFormFields();
  const { filePath, startLine, endLine, label } = fields;
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
  return { ...fields, handleSubmit, hasSubmitted, submitError, errors, hasErrors };
}

function ExcerptField({ label, value, onChange, placeholder, type = 'text', autoFocus = false, min, error }: ExcerptFieldProps): React.ReactElement {
  return (
    <div>
      <div className="text-text-semantic-muted" style={FIELD_LABEL_STYLE}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="text-text-semantic-primary" style={error ? INPUT_ERROR_STYLE : INPUT_STYLE}
        autoFocus={autoFocus} min={min} />
      {error ? <div className="text-status-error" style={ERROR_TEXT_STYLE}>{error}</div> : null}
    </div>
  );
}

function useFilePathKeyDown(opts: FilePathKeyDownOptions) {
  const { showSuggestions, suggestions, activeIndex, setActiveIndex, onChange, setShowSuggestions } = opts;
  return useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((p) => Math.min(p + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < suggestions.length) {
      e.preventDefault(); onChange(suggestions[activeIndex].path); setShowSuggestions(false); setActiveIndex(-1);
    } else if (e.key === 'Escape') { setShowSuggestions(false); setActiveIndex(-1); }
  }, [activeIndex, onChange, showSuggestions, suggestions, setActiveIndex, setShowSuggestions]);
}

interface SuggestionDropdownProps {
  suggestions: FileSuggestion[];
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  onChange: (v: string) => void;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
}

function SuggestionDropdown({ suggestions, activeIndex, setActiveIndex, onChange, setShowSuggestions }: SuggestionDropdownProps): React.ReactElement {
  return (
    <div style={SUGGESTION_LIST_STYLE}>
      {suggestions.map((s, i) => (
        <div key={s.path}
          className={i === activeIndex ? 'text-text-semantic-on-accent' : 'text-text-semantic-primary'}
          style={i === activeIndex ? SUGGESTION_ITEM_ACTIVE_STYLE : SUGGESTION_ITEM_STYLE}
          onMouseEnter={() => setActiveIndex(i)}
          onMouseDown={(e) => { e.preventDefault(); onChange(s.path); setShowSuggestions(false); setActiveIndex(-1); }}
          title={s.path}
        >{s.relativePath}</div>
      ))}
    </div>
  );
}

function FilePathInput({ value, onChange, error, showSuggestions, setShowSuggestions, handleKeyDown, suggestions, activeIndex, setActiveIndex }: {
  value: string; onChange: (v: string) => void; error: string | null;
  showSuggestions: boolean; setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  handleKeyDown: (e: React.KeyboardEvent) => void; suggestions: FileSuggestion[];
  activeIndex: number; setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
}): React.ReactElement {
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <input type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); setActiveIndex(-1); }}
        onFocus={() => setShowSuggestions(true)} onKeyDown={handleKeyDown}
        placeholder="Type a filename to search..." className="text-text-semantic-primary"
        style={error ? INPUT_ERROR_STYLE : INPUT_STYLE} autoFocus />
      {showSuggestions && suggestions.length > 0
        ? <SuggestionDropdown suggestions={suggestions} activeIndex={activeIndex} setActiveIndex={setActiveIndex} onChange={onChange} setShowSuggestions={setShowSuggestions} />
        : null}
    </div>
  );
}

function FilePathField({ value, onChange, error, projectRoot }: {
  value: string; onChange: (value: string) => void;
  error: string | null; projectRoot: string | null | undefined;
}): React.ReactElement {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useFileSuggestions(value, projectRoot);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogApi = resolveDialogApi();
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const handleKeyDown = useFilePathKeyDown({ showSuggestions, suggestions, activeIndex, setActiveIndex, onChange, setShowSuggestions });
  const handleBrowse = useCallback(() => {
    if (!dialogApi) return;
    void dialogApi.showOpenDialog({ properties: ['openFile'], title: 'Select file for excerpt' })
      .then((result) => { if (!result.canceled && result.filePaths.length > 0) onChange(result.filePaths[0]); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialogApi is resolved once at render; stable reference
  }, [onChange]);
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div className="text-text-semantic-muted" style={FIELD_LABEL_STYLE}>File path</div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <FilePathInput value={value} onChange={onChange} error={error} showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions} handleKeyDown={handleKeyDown}
          suggestions={suggestions} activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
        {dialogApi != null ? (
          <button type="button" onClick={handleBrowse} className="text-text-semantic-muted" style={CANCEL_BUTTON_STYLE} title="Browse for file">Browse...</button>
        ) : null}
      </div>
      {error ? <div className="text-status-error" style={ERROR_TEXT_STYLE}>{error}</div> : null}
    </div>
  );
}

function RangeFields({ startLine, endLine, setStartLine, setEndLine, startError, endError }: RangeFieldsProps): React.ReactElement {
  return (
    <div style={RANGE_FIELDS_STYLE}>
      <div style={{ flex: 1 }}><ExcerptField label="Start line" type="number" value={startLine} onChange={setStartLine} min="1" error={startError} /></div>
      <div style={{ flex: 1 }}><ExcerptField label="End line" type="number" value={endLine} onChange={setEndLine} min="1" error={endError} /></div>
    </div>
  );
}

function ExcerptActions({ onCancel, disabled }: { onCancel: () => void; disabled: boolean }): React.ReactElement {
  return (
    <div style={ACTIONS_STYLE}>
      <button type="button" onClick={onCancel} className="text-text-semantic-muted" style={CANCEL_BUTTON_STYLE}>Cancel</button>
      <button type="submit" className="text-text-semantic-on-accent" style={disabled ? SUBMIT_BUTTON_DISABLED_STYLE : SUBMIT_BUTTON_STYLE}>Add Excerpt</button>
    </div>
  );
}

export const AddExcerptForm = memo(function AddExcerptForm({ onAdd, onCancel, projectRoot }: AddExcerptFormProps): React.ReactElement {
  const form = useExcerptFormState(onAdd);
  const showErrors = form.hasSubmitted;
  return (
    <form onSubmit={form.handleSubmit} style={FORM_STYLE}>
      <div className="text-text-semantic-primary" style={FORM_TITLE_STYLE}>Add Excerpt</div>
      <FilePathField value={form.filePath} onChange={form.setFilePath} error={showErrors ? form.errors.filePath : null} projectRoot={projectRoot} />
      <RangeFields startLine={form.startLine} endLine={form.endLine} setStartLine={form.setStartLine} setEndLine={form.setEndLine} startError={showErrors ? form.errors.startLine : null} endError={showErrors ? form.errors.endLine : null} />
      <ExcerptField label="Label (optional)" value={form.label} onChange={form.setLabel} placeholder="e.g. handleClick" />
      {form.submitError ? <div className="text-status-error" style={ERROR_TEXT_STYLE}>{form.submitError}</div> : null}
      <ExcerptActions onCancel={onCancel} disabled={showErrors && form.hasErrors} />
    </form>
  );
});
