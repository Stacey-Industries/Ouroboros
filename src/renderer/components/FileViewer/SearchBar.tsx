import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';

export interface SearchMatch {
  /** Index of the text node in the flattened text-node list */
  nodeIndex: number;
  /** Character offset within the text node */
  offsetInNode: number;
  /** Length of the matched text */
  length: number;
  /** Absolute character offset in the full text */
  absoluteOffset: number;
}

export interface SearchBarProps {
  /** The container element holding rendered code (Shiki or plain <pre>) */
  codeContainer: HTMLElement | null;
  /** The scrollable ancestor that wraps the code area */
  scrollContainer: HTMLElement | null;
  /** Whether the search bar is visible */
  visible: boolean;
  /** Called when the user closes the search bar */
  onClose: () => void;
  /**
   * Called whenever the set of matched line numbers changes.
   * Line numbers are 1-based. Pass an empty array when there are no matches
   * or the search bar is closed.
   */
  onMatchLinesChange?: (lines: number[]) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Collect all text nodes under a root element in document order. */
function getTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    nodes.push(node);
  }
  return nodes;
}

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CSS class names for highlights
const MATCH_CLASS = 'fv-search-match';
const ACTIVE_MATCH_CLASS = 'fv-search-match-active';

// ── Component ───────────────────────────────────────────────────────────────

export function SearchBar({
  codeContainer,
  visible,
  onClose,
  onMatchLinesChange,
}: SearchBarProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Focus input on open / re-open ──
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [visible]);

  // ── Clear all <mark> elements and restore original text nodes ──
  const clearHighlights = useCallback(() => {
    if (!codeContainer) return;
    const marks = codeContainer.querySelectorAll(`mark.${MATCH_CLASS}`);
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const text = document.createTextNode(mark.textContent ?? '');
      parent.replaceChild(text, mark);
      parent.normalize(); // merge adjacent text nodes
    });
  }, [codeContainer]);

  // ── Perform search and highlight ──
  const performSearch = useCallback(() => {
    if (!codeContainer || !query) {
      clearHighlights();
      setMatches([]);
      setActiveMatchIndex(0);
      onMatchLinesChange?.([]);
      return;
    }

    // First clear any prior highlights
    clearHighlights();

    // Build regex from query
    let regex: RegExp;
    try {
      const pattern = useRegex ? query : escapeRegex(query);
      const flags = caseSensitive ? 'g' : 'gi';
      regex = new RegExp(pattern, flags);
    } catch {
      // Invalid regex — show no matches
      setMatches([]);
      setActiveMatchIndex(0);
      onMatchLinesChange?.([]);
      return;
    }

    // Gather text nodes and concatenate their text
    const textNodes = getTextNodes(codeContainer);
    const segments: { node: Text; start: number }[] = [];
    let fullText = '';
    for (const node of textNodes) {
      segments.push({ node, start: fullText.length });
      fullText += node.textContent ?? '';
    }

    // Find all matches in the concatenated text
    const foundMatches: SearchMatch[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(fullText)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      // Determine which text node this match starts in
      let segIdx = 0;
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].start <= m.index) {
          segIdx = i;
          break;
        }
      }
      foundMatches.push({
        nodeIndex: segIdx,
        offsetInNode: m.index - segments[segIdx].start,
        length: m[0].length,
        absoluteOffset: m.index,
      });
    }

    setMatches(foundMatches);
    setActiveMatchIndex(foundMatches.length > 0 ? 0 : 0);

    // Derive 1-based line numbers for each match and notify parent
    if (onMatchLinesChange) {
      // Build a newline-offset map from fullText
      const lineStartOffsets: number[] = [0];
      for (let ci = 0; ci < fullText.length; ci++) {
        if (fullText[ci] === '\n') {
          lineStartOffsets.push(ci + 1);
        }
      }
      const matchLines = foundMatches.map((fm) => {
        // Binary search for the line containing fm.absoluteOffset
        let lo = 0;
        let hi = lineStartOffsets.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (lineStartOffsets[mid] <= fm.absoluteOffset) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        return lo + 1; // 1-based
      });
      // Deduplicate
      onMatchLinesChange([...new Set(matchLines)]);
    }

    if (foundMatches.length === 0) return;

    // Now wrap each match in a <mark> element.
    // Process matches in reverse order so earlier offsets remain valid.
    // Handle matches that might span multiple text nodes (rare but possible).
    for (let mi = foundMatches.length - 1; mi >= 0; mi--) {
      const match = foundMatches[mi];
      const matchStart = match.absoluteOffset;
      const matchEnd = matchStart + match.length;

      // Find all text nodes that overlap this match
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const nodeText = seg.node.textContent ?? '';
        const nodeStart = seg.start;
        const nodeEnd = nodeStart + nodeText.length;

        if (nodeEnd <= matchStart || nodeStart >= matchEnd) continue;

        // Calculate overlap within this text node
        const overlapStart = Math.max(matchStart, nodeStart) - nodeStart;
        const overlapEnd = Math.min(matchEnd, nodeEnd) - nodeStart;

        const before = nodeText.slice(0, overlapStart);
        const matched = nodeText.slice(overlapStart, overlapEnd);
        const after = nodeText.slice(overlapEnd);

        const parent = seg.node.parentNode;
        if (!parent) continue;

        const mark = document.createElement('mark');
        mark.className = mi === 0 ? `${MATCH_CLASS} ${ACTIVE_MATCH_CLASS}` : MATCH_CLASS;
        mark.textContent = matched;

        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(mark);
        if (after) fragment.appendChild(document.createTextNode(after));

        parent.replaceChild(fragment, seg.node);

        // We need to refresh segments since DOM changed — but since we're going
        // in reverse, previously processed matches won't be affected.
        // For the current node, update to point at the 'after' text node if any.
        break; // Each match typically fits in one text node for code
      }
    }
  }, [codeContainer, query, caseSensitive, useRegex, clearHighlights, onMatchLinesChange]);

  // ── Debounced search ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch();
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [performSearch]);

  // ── Update active match highlight ──
  useEffect(() => {
    if (!codeContainer) return;
    const marks = codeContainer.querySelectorAll(`mark.${MATCH_CLASS}`);
    marks.forEach((mark, i) => {
      if (i === activeMatchIndex) {
        mark.classList.add(ACTIVE_MATCH_CLASS);
      } else {
        mark.classList.remove(ACTIVE_MATCH_CLASS);
      }
    });

    // Scroll to active match
    if (marks.length > 0 && marks[activeMatchIndex]) {
      const activeMark = marks[activeMatchIndex] as HTMLElement;
      activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeMatchIndex, codeContainer, matches]);

  // ── Navigation ──
  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // ── Close handler — clear highlights and reset ──
  const handleClose = useCallback(() => {
    clearHighlights();
    setMatches([]);
    setActiveMatchIndex(0);
    onClose();
  }, [clearHighlights, onClose]);

  // ── Keyboard handlers ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        goToNext();
      }
    },
    [handleClose, goToNext, goToPrev]
  );

  // ── Clean up highlights when component unmounts or becomes invisible ──
  useEffect(() => {
    if (!visible) {
      clearHighlights();
      setMatches([]);
      setActiveMatchIndex(0);
      onMatchLinesChange?.([]);
    }
  }, [visible, clearHighlights, onMatchLinesChange]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        right: '24px',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find..."
        spellCheck={false}
        style={{
          width: '200px',
          height: '26px',
          padding: '0 6px',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border)';
        }}
      />

      {/* Match count */}
      <span
        style={{
          color: matches.length > 0 ? 'var(--text-muted)' : 'var(--text-faint)',
          fontSize: '0.75rem',
          minWidth: '70px',
          textAlign: 'center',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {query
          ? matches.length > 0
            ? `${activeMatchIndex + 1} of ${matches.length}`
            : 'No matches'
          : ''}
      </span>

      {/* Case sensitive toggle */}
      <button
        title="Case sensitive (Alt+C)"
        onClick={() => setCaseSensitive((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          padding: 0,
          background: caseSensitive ? 'var(--accent)' : 'transparent',
          color: caseSensitive ? 'var(--bg)' : 'var(--text-muted)',
          border: '1px solid',
          borderColor: caseSensitive ? 'var(--accent)' : 'var(--border)',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: 'var(--font-ui)',
        }}
      >
        Aa
      </button>

      {/* Regex toggle */}
      <button
        title="Use regular expression (Alt+R)"
        onClick={() => setUseRegex((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          padding: 0,
          background: useRegex ? 'var(--accent)' : 'transparent',
          color: useRegex ? 'var(--bg)' : 'var(--text-muted)',
          border: '1px solid',
          borderColor: useRegex ? 'var(--accent)' : 'var(--border)',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
        }}
      >
        .*
      </button>

      {/* Prev button */}
      <button
        title="Previous match (Shift+Enter)"
        onClick={goToPrev}
        disabled={matches.length === 0}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          padding: 0,
          background: 'transparent',
          color: matches.length > 0 ? 'var(--text-muted)' : 'var(--text-faint)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          cursor: matches.length > 0 ? 'pointer' : 'default',
          opacity: matches.length > 0 ? 1 : 0.5,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Next button */}
      <button
        title="Next match (Enter)"
        onClick={goToNext}
        disabled={matches.length === 0}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          padding: 0,
          background: 'transparent',
          color: matches.length > 0 ? 'var(--text-muted)' : 'var(--text-faint)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          cursor: matches.length > 0 ? 'pointer' : 'default',
          opacity: matches.length > 0 ? 1 : 0.5,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Close button */}
      <button
        title="Close (Escape)"
        onClick={handleClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          padding: 0,
          background: 'transparent',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
