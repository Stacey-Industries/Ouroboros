/**
 * FileTree — multi-root hierarchical tree view.
 *
 * Each root is rendered as a collapsible RootSection with its own independent
 * tree state, git status polling, search, and file operations.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { EmptyState } from '../shared';
import { useToastContext } from '../../contexts/ToastContext';
import { SearchOverlay } from './SearchOverlay';
import { useFileHeatMap } from '../../hooks/useFileHeatMap';
import { RootSection } from './RootSection';
import { PinnedSection } from './PinnedSection';

export interface FileTreeProps {
  projectRoots: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onRemoveRoot?: (root: string) => void;
  projectRoot?: string | null;
}

export function FileTree({
  projectRoots, activeFilePath, onFileSelect,
  onRemoveRoot, projectRoot: singleRootProp,
}: FileTreeProps): React.ReactElement {
  const roots = useMemo(() => {
    if (projectRoots.length > 0) return projectRoots;
    if (singleRootProp) return [singleRootProp];
    return [];
  }, [projectRoots, singleRootProp]);

  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set(roots));
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [extraIgnorePatterns, setExtraIgnorePatterns] = useState<string[]>([]);
  const [heatMapEnabled, setHeatMapEnabled] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToastContext();
  const { getHeatLevel, heatMap } = useFileHeatMap(heatMapEnabled);

  useEffect(() => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      for (const r of roots) if (!next.has(r)) next.add(r);
      return next;
    });
  }, [roots]);

  const toggleRoot = useCallback((root: string) => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(root)) next.delete(root); else next.add(root);
      return next;
    });
  }, []);

  useEffect(() => {
    void window.electronAPI.config.get('bookmarks').then((v) => setBookmarks((v as string[]) ?? []));
    void window.electronAPI.config.get('fileTreeIgnorePatterns').then((v) => setExtraIgnorePatterns((v as string[]) ?? []));
    const cleanup = window.electronAPI.config.onExternalChange((cfg) => {
      setBookmarks(cfg.bookmarks ?? []);
      setExtraIgnorePatterns(cfg.fileTreeIgnorePatterns ?? []);
    });
    return cleanup;
  }, []);

  const handleUnpin = useCallback(async (path: string) => {
    const updated = bookmarks.filter((p) => p !== path);
    const result = await window.electronAPI.config.set('bookmarks', updated);
    if (result.success) {
      setBookmarks(updated);
      const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
      toast(`Removed "${name}" from Pinned`, 'success');
    } else {
      toast(`Unpin failed: ${result.error}`, 'error');
    }
  }, [bookmarks, toast]);

  if (roots.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <EmptyState icon="folder" title="Open a folder to get started" description="Use the project picker above or open a folder from the File menu." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SearchBar query={query} setQuery={setQuery} inputRef={inputRef} heatMapEnabled={heatMapEnabled} setHeatMapEnabled={setHeatMapEnabled} heatMapCount={heatMap.size} />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <PinnedSection bookmarks={bookmarks} activeFilePath={activeFilePath} onFileSelect={onFileSelect} onUnpin={(p) => void handleUnpin(p)} />
        {roots.map((root) => (
          <RootSection key={root} root={root} isExpanded={expandedRoots.has(root)} onToggle={() => toggleRoot(root)} activeFilePath={activeFilePath} onFileSelect={onFileSelect} onRemove={roots.length > 1 && onRemoveRoot ? () => onRemoveRoot(root) : undefined} bookmarks={bookmarks} extraIgnorePatterns={extraIgnorePatterns} getHeatLevel={heatMapEnabled ? getHeatLevel : undefined} />
        ))}
        {query.trim().length > 0 && (
          <SearchOverlay roots={roots} query={query} activeFilePath={activeFilePath} onFileSelect={(p) => { onFileSelect(p); setQuery(''); }} />
        )}
      </div>
    </div>
  );
}

// ─── SearchBar sub-component ──────────────────────────────────────────────────

interface SearchBarProps {
  query: string;
  setQuery: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  heatMapEnabled: boolean;
  setHeatMapEnabled: (fn: (prev: boolean) => boolean) => void;
  heatMapCount: number;
}

function SearchBar({ query, setQuery, inputRef, heatMapEnabled, setHeatMapEnabled, heatMapCount }: SearchBarProps): React.ReactElement {
  return (
    <div style={{ padding: '6px 8px', flexShrink: 0, borderBottom: '1px solid var(--border-muted)' }}>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          aria-label="Filter files"
          className="selectable"
          style={{ flex: 1, minWidth: 0, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '0.8125rem', fontFamily: 'var(--font-ui)', outline: 'none', boxSizing: 'border-box' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <HeatMapToggle enabled={heatMapEnabled} toggle={() => setHeatMapEnabled((p) => !p)} count={heatMapCount} />
      </div>
    </div>
  );
}

function HeatMapToggle({ enabled, toggle, count }: { enabled: boolean; toggle: () => void; count: number }): React.ReactElement {
  const title = enabled ? `Heat map ON - ${count} file${count !== 1 ? 's' : ''} tracked (click to disable)` : 'Show file edit heat map';
  return (
    <button
      onClick={toggle}
      title={title}
      aria-label={enabled ? 'Disable heat map overlay' : 'Enable heat map overlay'}
      aria-pressed={enabled}
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', padding: 0, background: enabled ? 'rgba(239, 68, 68, 0.15)' : 'transparent', border: enabled ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', color: enabled ? '#ef4444' : 'var(--text-faint)', transition: 'all 150ms' }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1C8 1 3 6 3 10a5 5 0 0 0 10 0c0-4-5-9-5-9zM6.5 12.5a2 2 0 0 1-1-1.73c0-1.5 2.5-4.27 2.5-4.27s2.5 2.77 2.5 4.27a2 2 0 0 1-1 1.73" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill={enabled ? 'currentColor' : 'none'} fillOpacity={enabled ? 0.3 : 0} />
      </svg>
    </button>
  );
}
