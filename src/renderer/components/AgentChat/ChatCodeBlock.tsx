import React, { useCallback, useMemo, useState } from 'react';

import type { DiffLine } from './useApplyCode';
import { useApplyCode } from './useApplyCode';

export interface ChatCodeBlockProps {
  code: string;
  language?: string;
  filePath?: string;
  showApply?: boolean;
}

/* ---------- Icons ---------- */

function CopyIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WrapIcon({ active }: { active: boolean }): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.5 }}
    >
      <path d="M3 6h18M3 12h15a3 3 0 010 6h-4" />
      <polyline points="16 16 14 18 16 20" />
    </svg>
  );
}

function OpenFileIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/* ---------- Line numbers gutter ---------- */

function LineNumbers({ count }: { count: number }): React.ReactElement {
  const lines = useMemo(() => {
    const arr: number[] = [];
    for (let i = 1; i <= count; i++) arr.push(i);
    return arr;
  }, [count]);

  return (
    <div
      className="select-none pr-3 text-right"
      style={{
        color: 'var(--text-faint, var(--text-muted))',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: '1.5',
        minWidth: '2.5em',
        userSelect: 'none',
      }}
      aria-hidden
    >
      {lines.map((n) => (
        <div key={n}>{n}</div>
      ))}
    </div>
  );
}

/* ---------- Inline diff preview ---------- */

function ApplyDiffPreview({
  diffLines,
  onAccept,
  onReject,
}: {
  diffLines: DiffLine[];
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  return (
    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div
        className="overflow-auto"
        style={{ maxHeight: '200px', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.5' }}
      >
        {diffLines.map((line, i) => {
          const bgColor =
            line.type === 'add'
              ? 'var(--diff-add-bg, rgba(46, 160, 67, 0.15))'
              : line.type === 'del'
                ? 'var(--diff-del-bg, rgba(248, 81, 73, 0.15))'
                : 'transparent';
          const textColor =
            line.type === 'add'
              ? 'var(--diff-add, #2ea043)'
              : line.type === 'del'
                ? 'var(--diff-del, #f85149)'
                : 'var(--text-muted)';
          const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';

          return (
            <div key={i} className="whitespace-pre px-3" style={{ backgroundColor: bgColor, color: textColor }}>
              {prefix} {line.text}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 border-t px-3 py-1.5" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onAccept}
          className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', border: '1px solid rgba(63, 185, 80, 0.3)' }}
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: '#f85149', border: '1px solid rgba(248, 81, 73, 0.3)' }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

/* ---------- File path breadcrumb ---------- */

function FilePathBreadcrumb({ filePath }: { filePath: string }): React.ReactElement {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Show last 3 segments at most
  const visible = parts.length > 3 ? ['...', ...parts.slice(-3)] : parts;

  return (
    <span className="ml-1.5 truncate text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
      {visible.join(' / ')}
    </span>
  );
}

/* ---------- Main ChatCodeBlock component ---------- */

/**
 * Enhanced code block for the agent chat. Provides:
 * - Language label and file path breadcrumb
 * - Line numbers (auto-enabled for blocks > 20 lines, toggleable)
 * - Word wrap toggle
 * - Copy with "Copied!" feedback
 * - "Open in editor" button (dispatches DOM event)
 * - Apply/Revert workflow (when filePath is provided)
 *
 * All controls live in a compact header bar above the code.
 */
export const ChatCodeBlock = React.memo(function ChatCodeBlock({
  code,
  language,
  filePath,
  showApply = true,
}: ChatCodeBlockProps): React.ReactElement {
  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const [showLineNumbers, setShowLineNumbers] = useState(lineCount > 20);
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);

  const { status, errorMessage, diffLines, apply, accept, reject, revert, canRevert } = useApplyCode(
    code,
    language ?? '',
    filePath,
  );

  const isApplied = status === 'applied';

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  const handleOpenInEditor = useCallback(() => {
    if (!filePath) return;
    window.dispatchEvent(
      new CustomEvent('agent-ide:open-file', { detail: { path: filePath } }),
    );
  }, [filePath]);

  return (
    <div
      className="group/code my-2 rounded-md border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      {/* ── Header bar ── */}
      <div
        className="flex items-center gap-1.5 border-b px-2.5 py-1"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Left side: language + file path */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {language && (
            <span className="shrink-0 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {language}
            </span>
          )}
          {filePath && <FilePathBreadcrumb filePath={filePath} />}
        </div>

        {/* Right side: controls */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Apply status */}
          {isApplied && (
            <span className="text-[10px] font-medium" style={{ color: '#3fb950' }}>
              Applied
            </span>
          )}
          {isApplied && canRevert && (
            <button
              onClick={() => void revert()}
              className="text-[10px] underline transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              Revert
            </button>
          )}
          {status === 'error' && errorMessage && (
            <span className="text-[10px]" style={{ color: 'var(--error, #f85149)' }}>
              {errorMessage}
            </span>
          )}

          {/* Line numbers toggle */}
          <button
            onClick={() => setShowLineNumbers((v) => !v)}
            title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            className="rounded p-0.5 transition-colors hover:bg-[var(--bg)]"
            style={{ color: showLineNumbers ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h7" />
            </svg>
          </button>

          {/* Word wrap toggle */}
          <button
            onClick={() => setWordWrap((v) => !v)}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            className="rounded p-0.5 transition-colors hover:bg-[var(--bg)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <WrapIcon active={wordWrap} />
          </button>

          {/* Apply button */}
          {showApply && filePath && !isApplied && status === 'idle' && (
            <button
              onClick={() => void apply()}
              title="Apply to file"
              className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'rgba(100, 100, 255, 0.1)',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              Apply
            </button>
          )}

          {/* Open in editor */}
          {filePath && (
            <button
              onClick={handleOpenInEditor}
              title="Open in editor"
              className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)]"
            >
              <OpenFileIcon />
            </button>
          )}

          {/* Copy button */}
          <button
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy code'}
            className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)]"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {copied && (
            <span className="text-[10px] font-medium" style={{ color: '#3fb950' }}>
              Copied!
            </span>
          )}
        </div>
      </div>

      {/* ── Code body ── */}
      <div className="flex overflow-x-auto p-3" style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {showLineNumbers && <LineNumbers count={lineCount} />}
        <pre
          className="flex-1"
          style={{
            whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            wordBreak: wordWrap ? 'break-all' : 'normal',
            margin: 0,
          }}
        >
          <code
            className={`text-xs ${language ? `language-${language}` : ''}`}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {code}
          </code>
        </pre>
      </div>

      {/* ── Inline diff preview ── */}
      {status === 'previewing' && diffLines.length > 0 && (
        <ApplyDiffPreview
          diffLines={diffLines}
          onAccept={() => void accept()}
          onReject={reject}
        />
      )}
    </div>
  );
});
