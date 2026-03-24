import React, { useCallback, useMemo, useState } from 'react';

import {
  ApplyDiffPreview,
  CodeHeaderActions,
  CodeHeaderStatus,
  CodeHeaderToggles,
  FilePathBreadcrumb,
} from './ChatCodeBlockParts';
import { useApplyCode } from './useApplyCode';

export interface ChatCodeBlockProps {
  code: string;
  language?: string;
  filePath?: string;
  showApply?: boolean;
}

function LineNumbers({ count }: { count: number }): React.ReactElement {
  const lines = useMemo(() => Array.from({ length: count }, (_, index) => index + 1), [count]);
  return (
    <div
      className="select-none pr-3 text-right text-text-semantic-faint"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: '1.5',
        minWidth: '2.5em',
        userSelect: 'none',
      }}
      aria-hidden
    >
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function CodeHeader({
  language,
  filePath,
  showLineNumbers,
  setShowLineNumbers,
  wordWrap,
  setWordWrap,
  showApply,
  isApplied,
  canRevert,
  apply,
  revert,
  status,
  errorMessage,
  handleOpenInEditor,
  copied,
  handleCopy,
}: {
  language?: string;
  filePath?: string;
  showLineNumbers: boolean;
  setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
  wordWrap: boolean;
  setWordWrap: React.Dispatch<React.SetStateAction<boolean>>;
  showApply: boolean;
  isApplied: boolean;
  canRevert: boolean;
  apply: () => Promise<void>;
  revert: () => Promise<void>;
  status: string;
  errorMessage?: string;
  handleOpenInEditor: () => void;
  copied: boolean;
  handleCopy: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 border-b border-border-semantic px-2.5 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {language && (
          <span className="shrink-0 text-[10px] font-medium text-text-semantic-muted">
            {language}
          </span>
        )}
        {filePath && <FilePathBreadcrumb filePath={filePath} />}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <CodeHeaderStatus
          isApplied={isApplied}
          canRevert={canRevert}
          revert={revert}
          status={status}
          errorMessage={errorMessage}
        />
        <CodeHeaderToggles
          showLineNumbers={showLineNumbers}
          setShowLineNumbers={setShowLineNumbers}
          wordWrap={wordWrap}
          setWordWrap={setWordWrap}
        />
        <CodeHeaderActions
          showApply={showApply}
          filePath={filePath}
          isApplied={isApplied}
          status={status}
          apply={apply}
          handleOpenInEditor={handleOpenInEditor}
          copied={copied}
          handleCopy={handleCopy}
        />
      </div>
    </div>
  );
}

function CodeBody({
  code,
  language,
  wordWrap,
  showLineNumbers,
  lineCount,
}: {
  code: string;
  language?: string;
  wordWrap: boolean;
  showLineNumbers: boolean;
  lineCount: number;
}): React.ReactElement {
  return (
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
  );
}

function useChatCodeBlockState(
  code: string,
  language: string | undefined,
  filePath: string | undefined,
) {
  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const [showLineNumbers, setShowLineNumbers] = useState(lineCount > 20);
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const applyCode = useApplyCode(code, language ?? '', filePath);
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);
  const handleOpenInEditor = useCallback(() => {
    if (filePath)
      window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { filePath } }));
  }, [filePath]);
  return {
    lineCount,
    showLineNumbers,
    setShowLineNumbers,
    wordWrap,
    setWordWrap,
    copied,
    handleCopy,
    handleOpenInEditor,
    ...applyCode,
  };
}

export const ChatCodeBlock = React.memo(function ChatCodeBlock({
  code,
  language,
  filePath,
  showApply = true,
}: ChatCodeBlockProps): React.ReactElement {
  const {
    lineCount,
    showLineNumbers,
    setShowLineNumbers,
    wordWrap,
    setWordWrap,
    copied,
    handleCopy,
    handleOpenInEditor,
    status,
    errorMessage,
    diffLines,
    apply,
    accept,
    reject,
    revert,
    canRevert,
  } = useChatCodeBlockState(code, language, filePath);
  const isApplied = status === 'applied';
  return (
    <div className="group/code my-2 rounded-md border border-border-semantic bg-surface-raised">
      <CodeHeader
        language={language}
        filePath={filePath}
        showLineNumbers={showLineNumbers}
        setShowLineNumbers={setShowLineNumbers}
        wordWrap={wordWrap}
        setWordWrap={setWordWrap}
        showApply={showApply}
        isApplied={isApplied}
        canRevert={canRevert}
        apply={apply}
        revert={revert}
        status={status}
        errorMessage={errorMessage}
        handleOpenInEditor={handleOpenInEditor}
        copied={copied}
        handleCopy={handleCopy}
      />
      <CodeBody
        code={code}
        language={language}
        wordWrap={wordWrap}
        showLineNumbers={showLineNumbers}
        lineCount={lineCount}
      />
      {status === 'previewing' && diffLines.length > 0 && (
        <ApplyDiffPreview diffLines={diffLines} onAccept={() => void accept()} onReject={reject} />
      )}
    </div>
  );
});
