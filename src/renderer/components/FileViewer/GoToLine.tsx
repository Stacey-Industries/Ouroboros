import React, { useCallback,useEffect, useRef, useState } from 'react';

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

const popupBaseStyle: React.CSSProperties = {
  position: 'absolute',
  top: '8px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  backgroundColor: 'var(--surface-panel)',
  borderRadius: '6px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
  transition: 'border-color 0.15s',
};

const inputBaseStyle: React.CSSProperties = {
  width: '120px',
  height: '26px',
  padding: '0 6px',
  backgroundColor: 'var(--surface-base)',
  borderRadius: '3px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const lineRangeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

export function GoToLine(props: GoToLineProps): React.ReactElement<any> | null {
  const controller = useGoToLineController(props);
  if (!props.visible) return null;

  return (
    <GoToLinePanel
      lineCount={props.lineCount}
      value={controller.value}
      hasError={controller.hasError}
      inputRef={controller.inputRef}
      onChange={controller.handleChange}
      onKeyDown={controller.handleKeyDown}
    />
  );
}

function useGoToLineController({
  visible,
  lineCount,
  scrollContainer,
  codeContainer,
  onClose,
}: GoToLineProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValue('');
    setHasError(false);
    inputRef.current?.focus();
  }, [visible]);

  const handleGo = useCallback(() => {
    const lineNum = parseTargetLine(value, lineCount);
    if (lineNum === null) return setHasError(true);
    setHasError(false);
    goToLine(lineNum, scrollContainer, codeContainer);
    onClose();
  }, [value, lineCount, scrollContainer, codeContainer, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => handleGoToLineKeyDown(event, onClose, handleGo),
    [handleGo, onClose]
  );

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setHasError(false);
  }, []);

  return { inputRef, value, hasError, handleChange, handleKeyDown };
}

interface GoToLinePanelProps {
  lineCount: number;
  value: string;
  hasError: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

function GoToLinePanel({
  lineCount,
  value,
  hasError,
  inputRef,
  onChange,
  onKeyDown,
}: GoToLinePanelProps): React.ReactElement<any> {
  return (
    <div style={getPopupStyle(hasError)} onKeyDown={onKeyDown}>
      <GoToLineInput
        ref={inputRef}
        value={value}
        hasError={hasError}
        onChange={onChange}
      />
      <span className="text-text-semantic-faint" style={lineRangeStyle}>1 &ndash; {lineCount}</span>
    </div>
  );
}

function GoToLineInput({ value, hasError, onChange, ref }: {
  value: string;
  hasError: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  ref?: React.Ref<HTMLInputElement>;
}): React.ReactElement<any> {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={onChange}
      placeholder="Go to line..."
      spellCheck={false}
      className="text-text-semantic-primary"
      style={getInputStyle(hasError)}
      onFocus={(event) => updateInputBorderColor(event.currentTarget, hasError, 'var(--interactive-accent)')}
      onBlur={(event) => updateInputBorderColor(event.currentTarget, hasError, 'var(--border-semantic)')}
    />
  );
}

function parseTargetLine(value: string, lineCount: number): number | null {
  const lineNum = Number.parseInt(value, 10);
  return Number.isNaN(lineNum) || lineNum < 1 || lineNum > lineCount ? null : lineNum;
}

function goToLine(
  lineNum: number,
  scrollContainer: HTMLElement | null,
  codeContainer: HTMLElement | null
): void {
  if (!scrollContainer) return;

  const metrics = getRenderedLineMetrics(scrollContainer);
  const scrollTarget = metrics.paddingTop + (lineNum - 1) * metrics.lineHeight;

  scrollContainer.scrollTo({
    top: scrollTarget - scrollContainer.clientHeight / 3,
    behavior: 'smooth',
  });

  highlightLine({
    scrollContainer,
    codeContainer,
    lineNum,
    lineHeight: metrics.lineHeight,
    paddingTop: metrics.paddingTop,
  });
}

function getRenderedLineMetrics(scrollContainer: HTMLElement): {
  lineHeight: number;
  paddingTop: number;
} {
  const gutterLines = scrollContainer.querySelectorAll('[aria-hidden="true"] > div');
  const lineHeight = gutterLines.length > 0 ? (gutterLines[0] as HTMLElement).offsetHeight : 20.8;
  return { lineHeight, paddingTop: 16 };
}

function handleGoToLineKeyDown(
  event: React.KeyboardEvent,
  onClose: () => void,
  onGo: () => void
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    onGo();
  }
}

function getPopupStyle(hasError: boolean): React.CSSProperties {
  return {
    ...popupBaseStyle,
    border: `1px solid ${hasError ? 'var(--status-error)' : 'var(--border-semantic)'}`,
  };
}

function getInputStyle(hasError: boolean): React.CSSProperties {
  return {
    ...inputBaseStyle,
    border: `1px solid ${hasError ? 'var(--status-error)' : 'var(--border-semantic)'}`,
  };
}

function updateInputBorderColor(
  input: HTMLInputElement,
  hasError: boolean,
  borderColor: string
): void {
  if (!hasError) input.style.borderColor = borderColor;
}

interface HighlightLineOptions {
  scrollContainer: HTMLElement;
  codeContainer: HTMLElement | null;
  lineNum: number;
  lineHeight: number;
  paddingTop: number;
}

function highlightLine(options: HighlightLineOptions): void {
  const { scrollContainer, codeContainer, lineNum, lineHeight, paddingTop } = options;
  const highlight = document.createElement('div');

  highlight.className = 'fv-goto-highlight';
  highlight.style.position = 'absolute';
  highlight.style.left = '0';
  highlight.style.right = '0';
  highlight.style.top = `${paddingTop + (lineNum - 1) * lineHeight}px`;
  highlight.style.height = `${lineHeight}px`;
  highlight.style.backgroundColor = 'var(--interactive-accent)';
  highlight.style.opacity = '0.25';
  highlight.style.pointerEvents = 'none';
  highlight.style.transition = 'opacity 0.8s ease-out';
  highlight.style.zIndex = '5';

  const highlightParent =
    codeContainer ?? (scrollContainer.firstElementChild as HTMLElement | null) ?? scrollContainer;

  highlightParent.style.position = 'relative';
  highlightParent.appendChild(highlight);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      highlight.style.opacity = '0';
    });
  });

  setTimeout(() => {
    highlight.remove();
  }, 1200);
}
