import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { getFileIcon } from '../FileTree/fileIcons';
import { useTheme } from '../../hooks/useTheme';
import { SearchBar } from './SearchBar';
import { GoToLine } from './GoToLine';
import { DiffView } from './DiffView';
import { Minimap } from './Minimap';
import { BlameGutter } from './BlameGutter';
import { ImageViewer } from './ImageViewer';
import { MarkdownPreview } from './MarkdownPreview';
import { SymbolOutline } from './SymbolOutline';
import { SemanticScrollbar } from './SemanticScrollbar';
import { useFoldRanges } from './useFoldRanges';
import { useGitDiff } from '../../hooks/useGitDiff';
import { useGitBlame } from '../../hooks/useGitBlame';
import { useSymbolOutline } from '../../hooks/useSymbolOutline';
import type { DiffLineInfo } from '../../types/electron';
import { EmptyState as SharedEmptyState, CodeSkeleton } from '../shared';
import { injectLinks, ensureLinkStyles, attachLinkClickHandler } from './linkDetector';
import { CommitHistory } from './CommitHistory';
import { ConflictResolver, hasConflictMarkers, parseConflictBlocks } from './ConflictResolver';
import type { ConflictBlock } from './ConflictResolver';
import { InlineEditor } from './InlineEditor';
import {
  getLanguage,
  getShikiTheme,
  getHighlighter,
  parseShikiLines,
  computeVisibleLines,
} from './fileViewerUtils';

export interface FileViewerProps {
  filePath: string | null;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  /** When true, shows a banner indicating the file changed on disk */
  isDirtyOnDisk?: boolean;
  /** Called when the user clicks "Reload" on the dirty-on-disk banner */
  onReload?: () => void;
  /** Original content for diff comparison (before agent edits) */
  originalContent?: string | null;
  /** Project root for git operations (diff gutter, blame) */
  projectRoot?: string | null;
  /** When true, renders the file using ImageViewer instead of text */
  isImage?: boolean;
  /** Called when the user saves a file in edit mode */
  onSave?: (content: string) => void;
  /** Called when dirty state changes in the inline editor */
  onDirtyChange?: (dirty: boolean) => void;
  /** Whether the file has unsaved edits */
  isDirty?: boolean;
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <SharedEmptyState
      icon="document"
      title="Select a file to view"
      description="Choose a file from the tree to view its contents here."
    />
  );
}

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingState(): React.ReactElement {
  return <CodeSkeleton />;
}

// ─── Main FileViewer ──────────────────────────────────────────────────────────

/**
 * FileViewer — read-only syntax-highlighted code viewer using Shiki.
 *
 * - Highlights lazily: shows plain text first, highlighted markup when ready.
 * - Line numbers are rendered alongside the code.
 * - Code folding: collapse/expand foldable regions via gutter indicators.
 * - Horizontal scroll for long lines.
 * - Shows a banner if the file has changed on disk since opened.
 */
export const FileViewer = memo(function FileViewer({
  filePath,
  content,
  isLoading,
  error,
  isDirtyOnDisk,
  onReload,
  originalContent,
  projectRoot,
  isImage,
  onSave,
  onDirtyChange,
  isDirty,
}: FileViewerProps): React.ReactElement {
  // Derive the active Shiki theme from the IDE theme selection
  const { theme: ideTheme } = useTheme();
  const shikiTheme = getShikiTheme(ideTheme.id);

  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [highlightLang, setHighlightLang] = useState<string | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search & GoToLine state
  const [showSearch, setShowSearch] = useState(false);
  const [showGoToLine, setShowGoToLine] = useState(false);

  // Search match lines for semantic scrollbar (1-based)
  const [searchMatchLines, setSearchMatchLines] = useState<number[]>([]);

  // Scroll position state for semantic scrollbar
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, containerHeight: 0, scrollHeight: 0 });

  // Diff / preview view mode
  const [viewMode, setViewMode] = useState<'code' | 'diff' | 'preview'>('code');

  // Word wrap toggle (persisted in localStorage)
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fileviewer:wordWrap') === 'true';
    } catch {
      return false;
    }
  });

  // Minimap toggle (persisted in localStorage)
  const [showMinimap, setShowMinimap] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fileviewer:minimap') !== 'false'; // default on
    } catch {
      return true;
    }
  });

  // Blame toggle (persisted in localStorage)
  const [showBlame, setShowBlame] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fileviewer:blame') === 'true';
    } catch {
      return false;
    }
  });

  // Outline toggle (persisted in localStorage)
  const [showOutline, setShowOutline] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fileviewer:outline') === 'true';
    } catch {
      return false;
    }
  });

  // History toggle
  const [showHistory, setShowHistory] = useState(false);

  // Conflict blocks — populated when file contains git conflict markers
  const [conflictBlocks, setConflictBlocks] = useState<ConflictBlock[]>([]);

  // Inline edit mode
  const [editMode, setEditMode] = useState(false);

  // Git diff gutter data
  const { diffLines } = useGitDiff(projectRoot ?? null, filePath, content);

  // Git blame data (only fetched when blame is toggled on)
  const { blameLines } = useGitBlame(projectRoot ?? null, filePath, showBlame);

  // Build a lookup map for diff markers (1-based line number -> kind)
  const diffMap = useMemo(() => {
    const map = new Map<number, DiffLineInfo['kind']>();
    for (const dl of diffLines) {
      map.set(dl.line, dl.kind);
    }
    return map;
  }, [diffLines]);

  // Fold state: set of 0-based start-line indices that are collapsed
  const [collapsedFolds, setCollapsedFolds] = useState<Set<number>>(new Set());

  // Gutter hover state for showing fold indicators
  const [gutterHover, setGutterHover] = useState(false);

  // Fold detection (memoized, recomputes only when content changes)
  const { foldableLines } = useFoldRanges(content);

  // Persist word wrap preference
  useEffect(() => {
    try {
      localStorage.setItem('fileviewer:wordWrap', String(wordWrap));
    } catch { /* ignore */ }
  }, [wordWrap]);

  // Persist minimap preference
  useEffect(() => {
    try {
      localStorage.setItem('fileviewer:minimap', String(showMinimap));
    } catch { /* ignore */ }
  }, [showMinimap]);

  // Persist blame preference
  useEffect(() => {
    try {
      localStorage.setItem('fileviewer:blame', String(showBlame));
    } catch { /* ignore */ }
  }, [showBlame]);

  // Persist outline preference
  useEffect(() => {
    try {
      localStorage.setItem('fileviewer:outline', String(showOutline));
    } catch { /* ignore */ }
  }, [showOutline]);

  // Symbol outline — derived from content and language
  const outlineLanguage = filePath ? getLanguage(filePath) : 'text';
  const outlineSymbols = useSymbolOutline(content, outlineLanguage);

  // Determine if diff is available (original differs from current)
  const hasDiff =
    originalContent != null &&
    content != null &&
    originalContent !== content;

  // Determine if this is a markdown file (eligible for Preview toggle)
  const isMarkdown = filePath != null &&
    /\.(md|markdown)$/i.test(filePath);

  // Reset highlight and folds when file or content changes
  useEffect(() => {
    setHighlightedHtml(null);
    setHighlightLang(null);
    setCollapsedFolds(new Set());
  }, [filePath, content]);

  // Parse conflict blocks whenever content changes
  useEffect(() => {
    if (!content || !hasConflictMarkers(content)) {
      setConflictBlocks([]);
      return;
    }
    const blocks = parseConflictBlocks(content.split('\n'));
    setConflictBlocks(blocks);
  }, [content]);

  // Run syntax highlight asynchronously — reruns when file, content, or IDE theme changes
  const highlight = useCallback(async () => {
    if (!filePath || !content) return;
    const lang = getLanguage(filePath);
    if (lang === 'text') return; // don't highlight plain text

    try {
      const hl = await getHighlighter();

      // Load the language if not already loaded
      try {
        await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0]);
      } catch {
        // Language may already be loaded or not exist — ignore
      }

      const html = hl.codeToHtml(content, {
        lang,
        theme: shikiTheme,
      });
      setHighlightedHtml(html);
      setHighlightLang(lang);
    } catch (err) {
      console.warn('[FileViewer] highlight failed:', err);
      // Fall back to plain text
    }
  }, [filePath, content, shikiTheme]);

  useEffect(() => {
    highlight();
  }, [highlight]);

  // ── Inject link styles once ──
  useEffect(() => {
    ensureLinkStyles();
  }, []);

  // ── Track scroll metrics for semantic scrollbar ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setScrollMetrics({
        scrollTop: el.scrollTop,
        containerHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delegated link click handler ──
  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    return attachLinkClickHandler(
      el,
      () => filePath,
      () => projectRoot ?? null
    );
  }); // runs after every render so new DOM from innerHTML is covered

  // ── Close overlays and reset view mode when file changes ──
  useEffect(() => {
    setShowSearch(false);
    setShowGoToLine(false);
    setViewMode('code');
    setShowHistory(false);
    setEditMode(false);
  }, [filePath]);

  // ── Listen for agent-ide:scroll-to-line (dispatched after symbol search open) ──
  useEffect(() => {
    function onScrollToLine(e: Event): void {
      const { filePath: targetPath, line } = (e as CustomEvent<{ filePath: string; line: number }>).detail;
      if (targetPath !== filePath) return;
      if (!scrollRef.current || !codeRef.current) return;

      const scrollContainer = scrollRef.current;
      const gutterLines = scrollContainer.querySelectorAll('[aria-hidden="true"] > div');
      let lineHeight = 20.8;
      if (gutterLines.length > 0) {
        lineHeight = (gutterLines[0] as HTMLElement).offsetHeight;
      }
      const paddingTop = 16;
      const scrollTarget = paddingTop + (line - 1) * lineHeight;
      scrollContainer.scrollTo({
        top: scrollTarget - scrollContainer.clientHeight / 3,
        behavior: 'smooth',
      });

      // Brief highlight on the target line
      const highlight = document.createElement('div');
      highlight.style.position = 'absolute';
      highlight.style.left = '0';
      highlight.style.right = '0';
      highlight.style.top = `${paddingTop + (line - 1) * lineHeight}px`;
      highlight.style.height = `${lineHeight}px`;
      highlight.style.backgroundColor = 'var(--accent)';
      highlight.style.opacity = '0.25';
      highlight.style.pointerEvents = 'none';
      highlight.style.transition = 'opacity 0.8s ease-out';
      highlight.style.zIndex = '5';
      const contentRow = scrollContainer.firstElementChild as HTMLElement | null;
      if (contentRow) {
        contentRow.style.position = 'relative';
        contentRow.appendChild(highlight);
      } else {
        scrollContainer.appendChild(highlight);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          highlight.style.opacity = '0';
        });
      });
      setTimeout(() => highlight.remove(), 1200);
    }

    window.addEventListener('agent-ide:scroll-to-line', onScrollToLine);
    return () => window.removeEventListener('agent-ide:scroll-to-line', onScrollToLine);
  }, [filePath]);

  // ── Fold toggle ──
  const toggleFold = useCallback((startLine: number) => {
    setCollapsedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(startLine)) {
        next.delete(startLine);
      } else {
        next.add(startLine);
      }
      return next;
    });
  }, []);

  // ── Handle conflict resolution — update content after a block is resolved ──
  const handleConflictResolved = useCallback((newContent: string) => {
    if (!hasConflictMarkers(newContent)) {
      setConflictBlocks([]);
    } else {
      setConflictBlocks(parseConflictBlocks(newContent.split('\n')));
    }
    // The FileViewerManager owns content state; triggering a reload via onReload
    // would re-read from disk (which was just written). We dispatch a DOM event
    // so the manager picks up the new on-disk content.
    if (filePath) {
      window.dispatchEvent(
        new CustomEvent('agent-ide:reload-file', { detail: { filePath } })
      );
    }
  }, [filePath]);

  // ── Auto-unfold when search opens ──
  // SearchBar operates on DOM text nodes in codeRef, so all lines must be visible.
  useEffect(() => {
    if (showSearch && collapsedFolds.size > 0) {
      setCollapsedFolds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSearch]);

  // ── Keyboard shortcuts (Ctrl+F, Ctrl+G, Ctrl+D, Ctrl+Shift+[, Ctrl+Shift+]) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const target = e.target as HTMLElement;
      const isInsideContainer = container.contains(target);
      const isBodyLevel = target === document.body;

      if (!isInsideContainer && !isBodyLevel) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '[') {
        e.preventDefault();
        // Collapse the fold at the current line (determined by scroll position)
        const scrollEl = scrollRef.current;
        if (scrollEl) {
          const lineHeight = 20.8; // matches the hardcoded value used elsewhere
          const paddingTop = 16;
          const topLine = Math.floor((scrollEl.scrollTop - paddingTop + lineHeight / 2) / lineHeight);
          const currentLine = Math.max(0, topLine);
          // Find the nearest foldable range at or containing the current line
          let bestFold: number | null = null;
          for (const [startLine, range] of foldableLines) {
            if (startLine <= currentLine && range.end >= currentLine) {
              // Pick the innermost (largest startLine) fold containing current line
              if (bestFold === null || startLine > bestFold) {
                bestFold = startLine;
              }
            }
          }
          // If no containing fold, try the nearest fold starting at or after current line
          if (bestFold === null) {
            for (const [startLine] of foldableLines) {
              if (startLine >= currentLine) {
                if (bestFold === null || startLine < bestFold) {
                  bestFold = startLine;
                }
              }
            }
          }
          if (bestFold !== null) {
            setCollapsedFolds((prev) => {
              const next = new Set(prev);
              next.add(bestFold!);
              return next;
            });
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']') {
        e.preventDefault();
        // Expand the fold at the current line (determined by scroll position)
        const scrollEl = scrollRef.current;
        if (scrollEl) {
          const lineHeight = 20.8;
          const paddingTop = 16;
          const topLine = Math.floor((scrollEl.scrollTop - paddingTop + lineHeight / 2) / lineHeight);
          const currentLine = Math.max(0, topLine);
          // Find the collapsed fold at or containing the current line
          let bestFold: number | null = null;
          for (const startLine of collapsedFolds) {
            const range = foldableLines.get(startLine);
            if (!range) continue;
            if (startLine <= currentLine && range.end >= currentLine) {
              if (bestFold === null || startLine > bestFold) {
                bestFold = startLine;
              }
            }
          }
          // If no containing collapsed fold, try the nearest collapsed fold at or after current line
          if (bestFold === null) {
            for (const startLine of collapsedFolds) {
              if (startLine >= currentLine) {
                if (bestFold === null || startLine < bestFold) {
                  bestFold = startLine;
                }
              }
            }
          }
          // If still nothing, try the nearest collapsed fold before current line
          if (bestFold === null) {
            for (const startLine of collapsedFolds) {
              if (startLine < currentLine) {
                if (bestFold === null || startLine > bestFold) {
                  bestFold = startLine;
                }
              }
            }
          }
          if (bestFold !== null) {
            setCollapsedFolds((prev) => {
              const next = new Set(prev);
              next.delete(bestFold!);
              return next;
            });
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setShowGoToLine(false);
        setShowSearch(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch(false);
        setShowGoToLine(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        e.stopPropagation();
        if (hasDiff) {
          setViewMode((prev) => (prev === 'code' ? 'diff' : 'code'));
        }
      } else if (e.altKey && e.key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        setWordWrap((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasDiff, foldableLines, collapsedFolds]);

  // ── Render states ──

  if (!filePath && !isLoading) return <EmptyState />;
  if (isLoading) return <LoadingState />;

  // Image files: delegate entirely to ImageViewer
  if (isImage && filePath) {
    return <ImageViewer filePath={filePath} />;
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '8px',
          color: 'var(--error)',
          fontSize: '0.875rem',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '1.5rem' }}>⚠</span>
        <span>{error}</span>
      </div>
    );
  }

  if (content === null) return <EmptyState />;

  const lines = content.split('\n');
  const lineCount = lines.length;
  const gutterWidth = Math.max(3, String(lineCount).length) * 9 + 16; // approx char width
  const foldGutterWidth = 20;
  const diffGutterWidth = 4; // thin colored bar for diff markers

  // Parse Shiki output into per-line HTML (with link injection)
  const shikiLines = highlightedHtml
    ? parseShikiLines(injectLinks(highlightedHtml))
    : null;

  // Compute which lines are visible based on current fold state
  const { visible, foldedCounts } = computeVisibleLines(
    lineCount,
    collapsedFolds,
    foldableLines
  );

  // Build the rows to render (line number gutter, fold gutter, and code stay in sync)
  const rows: Array<
    | { type: 'line'; index: number }
    | { type: 'fold-placeholder'; startLine: number; count: number }
  > = [];

  for (let i = 0; i < lineCount; i++) {
    if (!visible.has(i)) continue;
    rows.push({ type: 'line', index: i });
    const foldedCount = foldedCounts.get(i);
    if (foldedCount != null) {
      rows.push({ type: 'fold-placeholder', startLine: i, count: foldedCount });
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
        outline: 'none',
      }}
    >
      {/* Disk-modified banner */}
      {isDirtyOnDisk && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: 'rgba(210, 153, 34, 0.12)',
            borderBottom: '1px solid rgba(210, 153, 34, 0.3)',
            fontSize: '0.8125rem',
            color: 'var(--warning)',
            flexShrink: 0,
          }}
        >
          <span>File has been modified on disk.</span>
          {onReload && (
            <button
              onClick={onReload}
              style={{
                background: 'none',
                border: '1px solid var(--warning)',
                borderRadius: '4px',
                color: 'var(--warning)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '1px 8px',
              }}
            >
              Reload
            </button>
          )}
        </div>
      )}

      {/* View mode toggle — shown when diff is available or markdown preview is applicable */}
      {(hasDiff || isMarkdown) && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '3px 12px',
            borderBottom: '1px solid var(--border-muted)',
            backgroundColor: 'var(--bg-secondary)',
            userSelect: 'none',
          }}
        >
          <button
            onClick={() => setViewMode('code')}
            title="Show code (Ctrl+D to toggle diff)"
            style={{
              padding: '2px 10px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              border: '1px solid',
              borderColor: viewMode === 'code' ? 'var(--accent)' : 'var(--border)',
              borderRadius: hasDiff ? '4px 0 0 4px' : (isMarkdown ? '4px 0 0 4px' : '4px'),
              backgroundColor: viewMode === 'code' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'code' ? 'var(--bg)' : 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: '1.5',
            }}
          >
            Code
          </button>
          {hasDiff && (
            <button
              onClick={() => setViewMode('diff')}
              title="Show diff (Ctrl+D to toggle)"
              style={{
                padding: '2px 10px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                border: '1px solid',
                borderColor: viewMode === 'diff' ? 'var(--accent)' : 'var(--border)',
                borderRadius: isMarkdown ? '0' : '0 4px 4px 0',
                backgroundColor: viewMode === 'diff' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'diff' ? 'var(--bg)' : 'var(--text-muted)',
                cursor: 'pointer',
                lineHeight: '1.5',
              }}
            >
              Diff
            </button>
          )}
          {isMarkdown && (
            <button
              onClick={() => setViewMode('preview')}
              title="Show markdown preview"
              style={{
                padding: '2px 10px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                border: '1px solid',
                borderColor: viewMode === 'preview' ? 'var(--accent)' : 'var(--border)',
                borderRadius: '0 4px 4px 0',
                backgroundColor: viewMode === 'preview' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'preview' ? 'var(--bg)' : 'var(--text-muted)',
                cursor: 'pointer',
                lineHeight: '1.5',
              }}
            >
              Preview
            </button>
          )}
        </div>
      )}

      {/* Toolbar — word wrap & minimap toggles */}
      {filePath && content !== null && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 12px',
            borderBottom: '1px solid var(--border-muted)',
            backgroundColor: 'var(--bg-secondary)',
            userSelect: 'none',
          }}
        >
          <button
            onClick={() => setWordWrap((prev) => !prev)}
            title="Toggle word wrap (Alt+Z)"
            style={{
              padding: '2px 8px',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              border: '1px solid',
              borderColor: wordWrap ? 'var(--accent)' : 'var(--border)',
              borderRadius: '4px',
              backgroundColor: wordWrap ? 'var(--accent)' : 'transparent',
              color: wordWrap ? 'var(--bg)' : 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: '1.5',
            }}
          >
            Wrap
          </button>
          <button
            onClick={() => setShowMinimap((prev) => !prev)}
            title="Toggle minimap"
            style={{
              padding: '2px 8px',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              border: '1px solid',
              borderColor: showMinimap ? 'var(--accent)' : 'var(--border)',
              borderRadius: '4px',
              backgroundColor: showMinimap ? 'var(--accent)' : 'transparent',
              color: showMinimap ? 'var(--bg)' : 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: '1.5',
            }}
          >
            Minimap
          </button>
          <button
            onClick={() => setShowBlame((prev) => !prev)}
            title="Toggle git blame annotations"
            style={{
              padding: '2px 8px',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              border: '1px solid',
              borderColor: showBlame ? 'var(--accent)' : 'var(--border)',
              borderRadius: '4px',
              backgroundColor: showBlame ? 'var(--accent)' : 'transparent',
              color: showBlame ? 'var(--bg)' : 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: '1.5',
            }}
          >
            Blame
          </button>
          <button
            onClick={() => setShowOutline((prev) => !prev)}
            title="Toggle symbol outline"
            style={{
              padding: '2px 8px',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              border: '1px solid',
              borderColor: showOutline ? 'var(--accent)' : 'var(--border)',
              borderRadius: '4px',
              backgroundColor: showOutline ? 'var(--accent)' : 'transparent',
              color: showOutline ? 'var(--bg)' : 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: '1.5',
            }}
          >
            Outline
          </button>
          {projectRoot && (
            <button
              onClick={() => setShowHistory((prev) => !prev)}
              title="Toggle commit history for this file"
              style={{
                padding: '2px 8px',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                border: '1px solid',
                borderColor: showHistory ? 'var(--accent)' : 'var(--border)',
                borderRadius: '4px',
                backgroundColor: showHistory ? 'var(--accent)' : 'transparent',
                color: showHistory ? 'var(--bg)' : 'var(--text-muted)',
                cursor: 'pointer',
                lineHeight: '1.5',
              }}
            >
              History
            </button>
          )}

          {/* Spacer to push edit button to the right */}
          <div style={{ flex: 1 }} />

          {/* Edit mode toggle + dirty indicator */}
          {onSave && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isDirty && (
                <span
                  title="Unsaved changes"
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent)',
                  }}
                />
              )}
              <button
                onClick={() => {
                  if (editMode && isDirty) {
                    const confirmed = window.confirm('You have unsaved changes. Discard them?');
                    if (!confirmed) return;
                    // Clear dirty state
                    onDirtyChange?.(false);
                  }
                  setEditMode((prev) => !prev);
                }}
                title={editMode ? 'Exit edit mode' : 'Edit file'}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.6875rem',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 500,
                  border: '1px solid',
                  borderColor: editMode ? 'var(--accent)' : 'var(--border)',
                  borderRadius: '4px',
                  backgroundColor: editMode ? 'var(--accent)' : 'transparent',
                  color: editMode ? 'var(--bg)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  lineHeight: '1.5',
                }}
              >
                {editMode ? 'Exit Edit' : 'Edit'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main content row: code/diff area + symbol outline panel */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>

      {/* Inline editor — replaces all other views when in edit mode */}
      {editMode && filePath && content != null && onSave ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <InlineEditor
            content={content}
            filePath={filePath}
            onSave={onSave}
            onDirtyChange={onDirtyChange ?? (() => {})}
          />
        </div>
      ) : showHistory && filePath && projectRoot ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <CommitHistory filePath={filePath} projectRoot={projectRoot} />
        </div>
      ) : viewMode === 'preview' && isMarkdown && content != null ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
          <MarkdownPreview content={content} />
        </div>
      ) : viewMode === 'diff' && hasDiff && originalContent != null && content != null ? (
        /* Diff view — shown when in diff mode and diff data is available */
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <DiffView originalContent={originalContent} currentContent={content} />
        </div>
      ) : conflictBlocks.length > 0 && content != null && filePath != null && viewMode === 'code' ? (
        /* Conflict resolver — shown when file has unresolved git conflict markers */
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ConflictResolver
            content={content}
            filePath={filePath}
            onResolved={handleConflictResolved}
          />
        </div>
      ) : (
      /* Code area */
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          lineHeight: '1.6',
        }}
      >
        {/* Search overlay */}
        <SearchBar
          codeContainer={codeRef.current}
          scrollContainer={scrollRef.current}
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          onMatchLinesChange={setSearchMatchLines}
        />

        {/* Go to line overlay */}
        <GoToLine
          lineCount={lineCount}
          scrollContainer={scrollRef.current}
          codeContainer={codeRef.current}
          visible={showGoToLine}
          onClose={() => setShowGoToLine(false)}
        />
        {/* Minimap overlay — only for files with 50+ lines */}
        {lineCount >= 50 && (
          <Minimap
            lines={lines}
            scrollContainer={scrollRef.current}
            visible={showMinimap}
          />
        )}

        {/* Semantic scrollbar — colored tick marks for matches, diff, folds */}
        <SemanticScrollbar
          totalLines={lineCount}
          scrollTop={scrollMetrics.scrollTop}
          containerHeight={scrollMetrics.containerHeight}
          scrollHeight={scrollMetrics.scrollHeight}
          lineHeight={parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.6}
          searchMatchLines={searchMatchLines}
          diffLines={diffLines}
          foldedLines={[...collapsedFolds]}
          onScrollToLine={(line) => {
            const el = scrollRef.current;
            if (!el) return;
            // Each line is lineHeight px tall; add 16px top padding
            const targetY = (line - 1) * parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.6 + 16;
            el.scrollTo({ top: targetY - el.clientHeight / 2, behavior: 'smooth' });
          }}
        />
        <div style={{ display: 'flex', minWidth: wordWrap ? undefined : 'max-content' }}>
          {/* Line number gutter */}
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: `${gutterWidth}px`,
              paddingTop: '16px',
              paddingBottom: '16px',
              textAlign: 'right',
              paddingRight: '4px',
              color: 'var(--text-faint)',
              backgroundColor: 'var(--bg)',
              position: 'sticky',
              left: 0,
              zIndex: 2,
              userSelect: 'none',
            }}
          >
            {rows.map((row) =>
              row.type === 'line' ? (
                <div key={`ln-${row.index}`} style={{ height: '1.6em' }}>
                  {row.index + 1}
                </div>
              ) : (
                <div key={`fp-ln-${row.startLine}`} style={{ height: '1.6em' }} />
              )
            )}
          </div>

          {/* Fold gutter */}
          <div
            aria-hidden="true"
            onMouseEnter={() => setGutterHover(true)}
            onMouseLeave={() => setGutterHover(false)}
            style={{
              flexShrink: 0,
              width: `${foldGutterWidth}px`,
              paddingTop: '16px',
              paddingBottom: '16px',
              backgroundColor: 'var(--bg)',
              position: 'sticky',
              left: `${gutterWidth}px`,
              zIndex: 2,
              userSelect: 'none',
            }}
          >
            {rows.map((row) => {
              if (row.type === 'fold-placeholder') {
                return <div key={`fg-fp-${row.startLine}`} style={{ height: '1.6em' }} />;
              }

              const i = row.index;
              const foldRange = foldableLines.get(i);
              const isCollapsed = collapsedFolds.has(i);
              const isFoldable = !!foldRange;
              const showIndicator = isFoldable && (isCollapsed || gutterHover);

              return (
                <div
                  key={`fg-${i}`}
                  style={{
                    height: '1.6em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showIndicator && (
                    <button
                      onClick={() => toggleFold(i)}
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        margin: 0,
                        cursor: 'pointer',
                        color: isCollapsed ? 'var(--text-muted)' : 'var(--text-faint)',
                        fontSize: '0.625rem',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '16px',
                        height: '16px',
                        borderRadius: '2px',
                      }}
                      onMouseOver={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          'var(--border-muted)';
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          'transparent';
                      }}
                    >
                      {isCollapsed ? '\u25B6' : '\u25BC'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Diff gutter — colored markers for added/modified/deleted lines */}
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: `${diffGutterWidth}px`,
              paddingTop: '16px',
              paddingBottom: '16px',
              backgroundColor: 'var(--bg)',
              position: 'sticky',
              left: `${gutterWidth + foldGutterWidth}px`,
              zIndex: 2,
              borderRight: '1px solid var(--border-muted)',
              userSelect: 'none',
            }}
          >
            {rows.map((row) => {
              if (row.type === 'fold-placeholder') {
                return <div key={`dg-fp-${row.startLine}`} style={{ height: '1.6em' }} />;
              }

              const lineNum = row.index + 1; // diff uses 1-based
              const kind = diffMap.get(lineNum);

              if (!kind) {
                return <div key={`dg-${row.index}`} style={{ height: '1.6em' }} />;
              }

              if (kind === 'deleted') {
                // Red triangle marker for deletions
                return (
                  <div
                    key={`dg-${row.index}`}
                    title="Line(s) deleted after this line"
                    style={{
                      height: '1.6em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '3px solid transparent',
                        borderRight: '3px solid transparent',
                        borderTop: '5px solid #f85149',
                        display: 'block',
                      }}
                    />
                  </div>
                );
              }

              const color = kind === 'added' ? '#3fb950' : '#58a6ff';
              const tooltip = kind === 'added' ? 'Added line' : 'Modified line';

              return (
                <div
                  key={`dg-${row.index}`}
                  title={tooltip}
                  style={{
                    height: '1.6em',
                    display: 'flex',
                    alignItems: 'stretch',
                  }}
                >
                  <div
                    style={{
                      width: `${diffGutterWidth}px`,
                      backgroundColor: color,
                      borderRadius: '1px',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Blame gutter — inline annotations */}
          {showBlame && blameLines.length > 0 && (
            <BlameGutter blameLines={blameLines} rows={rows} />
          )}

          {/* Code content */}
          <div
            ref={codeRef}
            className="selectable"
            style={{
              flex: 1,
              padding: '16px 16px 16px 12px',
              paddingRight: showMinimap && lineCount >= 50 ? '86px' : '16px',
              minWidth: 0,
            }}
          >
            {rows.map((row) => {
              if (row.type === 'fold-placeholder') {
                return (
                  <div
                    key={`code-fp-${row.startLine}`}
                    style={{
                      height: '1.6em',
                      lineHeight: '1.6em',
                      userSelect: 'none',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--text-faint)',
                        fontStyle: 'italic',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '3px',
                        paddingLeft: '8px',
                        paddingRight: '8px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                      onClick={() => toggleFold(row.startLine)}
                      title={`Click to expand ${row.count} lines`}
                    >
                      {'\u22EF'} {row.count} lines folded
                    </span>
                  </div>
                );
              }

              const i = row.index;

              if (shikiLines) {
                const lineHtml = shikiLines[i] ?? '';
                return (
                  <div
                    key={`code-${i}`}
                    className="code-line"
                    data-line={i}
                    style={{
                      minHeight: '1.6em',
                      whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                      wordBreak: wordWrap ? 'break-all' : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: lineHtml }}
                  />
                );
              }

              return (
                <div
                  key={`code-${i}`}
                  className="code-line"
                  data-line={i}
                  style={{
                    minHeight: '1.6em',
                    whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                    wordBreak: wordWrap ? 'break-all' : undefined,
                    color: 'var(--text)',
                  }}
                >
                  {lines[i]}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* Symbol outline panel */}
      <SymbolOutline
        symbols={outlineSymbols}
        scrollContainer={scrollRef.current}
        codeContainer={codeRef.current}
        visible={showOutline}
      />

      </div>{/* end main content row */}

      {/* Status bar */}
      {filePath && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '2px 12px',
            borderTop: '1px solid var(--border-muted)',
            backgroundColor: 'var(--bg-secondary)',
            fontSize: '0.6875rem',
            color: 'var(--text-faint)',
            userSelect: 'none',
          }}
        >
          <span>{lineCount} lines</span>
          {collapsedFolds.size > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {collapsedFolds.size} folded
            </span>
          )}
          {highlightLang && (
            <span style={{ color: getFileIcon(filePath).color }}>
              {highlightLang}
            </span>
          )}
          <span>UTF-8</span>
        </div>
      )}
    </div>
  );
});

// CSS keyframe for spinner + search highlight styles (injected once)
if (typeof document !== 'undefined') {
  const styleId = '__file-viewer-spin__';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      'mark.fv-search-match { background-color: rgba(255, 200, 0, 0.3); color: inherit; border-radius: 2px; }',
      'mark.fv-search-match.fv-search-match-active { background-color: rgba(255, 200, 0, 0.6); outline: 1px solid rgba(255, 200, 0, 0.8); }',
    ].join('\n');
    document.head.appendChild(style);
  }
}
