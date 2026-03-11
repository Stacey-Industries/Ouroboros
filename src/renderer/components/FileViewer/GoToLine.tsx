import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface GoToLineProps {
  /** Total number of lines in the file */
  lineCount: number;
  /** The scrollable container for the code area */
  scrollContainer: HTMLElement | null;
  /** The code container element (to find line elements for highlight) */
  codeContainer: HTMLElement | null;
  /** Whether the popup is visible */
  visible: boolean;
  /** Called when the popup should close */
  onClose: () => void;
}

export function GoToLine({
  lineCount,
  scrollContainer,
  codeContainer,
  visible,
  onClose,
}: GoToLineProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [hasError, setHasError] = useState(false);

  // Focus input on open
  useEffect(() => {
    if (visible && inputRef.current) {
      setValue('');
      setHasError(false);
      inputRef.current.focus();
    }
  }, [visible]);

  const handleGo = useCallback(() => {
    const lineNum = parseInt(value, 10);
    if (isNaN(lineNum) || lineNum < 1 || lineNum > lineCount) {
      setHasError(true);
      return;
    }

    setHasError(false);

    if (scrollContainer) {
      // Compute line height from the rendered content.
      // Lines use 1.6em at 0.8125rem (13px) = ~20.8px
      // But we can measure more accurately from the gutter divs.
      const gutterLines = scrollContainer.querySelectorAll('[aria-hidden="true"] > div');
      let lineHeight = 20.8; // fallback
      if (gutterLines.length > 0) {
        lineHeight = (gutterLines[0] as HTMLElement).offsetHeight;
      }

      const paddingTop = 16; // matches the 16px padding on gutter/code
      const scrollTarget = paddingTop + (lineNum - 1) * lineHeight;

      scrollContainer.scrollTo({
        top: scrollTarget - scrollContainer.clientHeight / 3,
        behavior: 'smooth',
      });

      // Briefly highlight the target line
      highlightLine(scrollContainer, codeContainer, lineNum, lineHeight, paddingTop);
    }

    onClose();
  }, [value, lineCount, scrollContainer, codeContainer, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleGo();
      }
    },
    [handleGo, onClose]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setHasError(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        backgroundColor: 'var(--bg-secondary)',
        border: `1px solid ${hasError ? 'var(--error, #e55)' : 'var(--border)'}`,
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
        transition: 'border-color 0.15s',
      }}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Go to line..."
        spellCheck={false}
        style={{
          width: '120px',
          height: '26px',
          padding: '0 6px',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          border: `1px solid ${hasError ? 'var(--error, #e55)' : 'var(--border)'}`,
          borderRadius: '3px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={(e) => {
          if (!hasError) e.target.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => {
          if (!hasError) e.target.style.borderColor = 'var(--border)';
        }}
      />
      <span
        style={{
          color: 'var(--text-faint)',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        1 &ndash; {lineCount}
      </span>
    </div>
  );
}

// ── Line highlight animation ─────────────────────────────────────────────────

function highlightLine(
  scrollContainer: HTMLElement,
  codeContainer: HTMLElement | null,
  lineNum: number,
  lineHeight: number,
  paddingTop: number
): void {
  // Create an overlay div positioned at the target line
  const highlight = document.createElement('div');
  highlight.className = 'fv-goto-highlight';
  highlight.style.position = 'absolute';
  highlight.style.left = '0';
  highlight.style.right = '0';
  highlight.style.top = `${paddingTop + (lineNum - 1) * lineHeight}px`;
  highlight.style.height = `${lineHeight}px`;
  highlight.style.backgroundColor = 'var(--accent)';
  highlight.style.opacity = '0.25';
  highlight.style.pointerEvents = 'none';
  highlight.style.transition = 'opacity 0.8s ease-out';
  highlight.style.zIndex = '5';

  // The scroll container has position: relative, but we need to place the
  // highlight inside the content flow. Use the first child (the flex row).
  const contentRow = scrollContainer.firstElementChild as HTMLElement | null;
  if (contentRow) {
    contentRow.style.position = 'relative';
    contentRow.appendChild(highlight);
  } else {
    scrollContainer.appendChild(highlight);
  }

  // Trigger fade-out after a short delay
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      highlight.style.opacity = '0';
    });
  });

  // Remove the element after animation completes
  setTimeout(() => {
    highlight.remove();
  }, 1200);
}
