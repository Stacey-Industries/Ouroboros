import React, { memo } from 'react';
import type { BufferExcerpt } from '../../types/electron';
import { useTheme } from '../../hooks/useTheme';
import { ExcerptSection } from './MultiBufferExcerpt';
import { getShikiTheme } from './multiBufferViewSyntax';

interface FileContentState {
  content: string | null;
  error: string | null;
  isLoading: boolean;
}

export interface MultiBufferViewProps {
  name: string;
  excerpts: BufferExcerpt[];
  /** Map of filePath -> { content, isLoading, error } */
  fileContents: Map<string, FileContentState>;
  onRemoveExcerpt: (index: number) => void;
  onOpenFile: (filePath: string) => void;
}

const EMPTY_FILE_CONTENT: FileContentState = {
  content: null,
  error: null,
  isLoading: true,
};

function getFileContent(
  fileContents: MultiBufferViewProps['fileContents'],
  filePath: string,
): FileContentState {
  return fileContents.get(filePath) ?? EMPTY_FILE_CONTENT;
}

function MultiBufferEmptyState(): React.ReactElement {
  return (
    <div
      className="text-text-semantic-muted"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontFamily: 'var(--font-ui)',
        gap: '12px',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '2rem',
          opacity: 0.4,
          lineHeight: 1,
        }}
      >
        {'\u2630'}
      </div>
      <span className="text-text-semantic-primary" style={{ fontSize: '1rem', fontWeight: 600 }}>
        No excerpts yet
      </span>
      <div
        style={{
          fontSize: '0.8125rem',
          lineHeight: 1.5,
          maxWidth: '340px',
        }}
      >
        Click &quot;+ Add Excerpt&quot; above to add code snippets from your project files.
        Each excerpt shows a specific line range from a file, letting you view
        related code from multiple files side by side.
      </div>
      <div
        className="text-text-semantic-faint"
        style={{
          marginTop: '8px',
          fontSize: '0.75rem',
          lineHeight: 1.5,
          maxWidth: '300px',
        }}
      >
        Tip: You can collapse, remove, or click through to the full file
        for each excerpt.
      </div>
    </div>
  );
}

function MultiBufferHeader({
  count,
  name,
}: {
  count: number;
  name: string;
}): React.ReactElement {
  return (
    <div
      className="text-text-semantic-primary"
      style={{
        padding: '8px 12px',
        backgroundColor: 'var(--surface-panel)',
        borderBottom: '1px solid var(--border-semantic)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.875rem',
        fontWeight: 600,
      }}
    >
      {name}
      <span
        className="text-text-semantic-muted"
        style={{
          fontWeight: 400,
          marginLeft: '8px',
          fontSize: '0.75rem',
        }}
      >
        {count} excerpt{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

export const MultiBufferView = memo(function MultiBufferView({
  name,
  excerpts,
  fileContents,
  onRemoveExcerpt,
  onOpenFile,
}: MultiBufferViewProps): React.ReactElement {
  const { theme: ideTheme } = useTheme();
  const shikiTheme = getShikiTheme(ideTheme.id);

  if (excerpts.length === 0) return <MultiBufferEmptyState />;

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        backgroundColor: 'var(--surface-base)',
      }}
    >
      <MultiBufferHeader count={excerpts.length} name={name} />
      {excerpts.map((excerpt, index) => {
        const fileContent = getFileContent(fileContents, excerpt.filePath);
        return (
          <ExcerptSection
            key={`${excerpt.filePath}:${excerpt.startLine}-${excerpt.endLine}:${index}`}
            excerpt={excerpt}
            index={index}
            content={fileContent.content}
            error={fileContent.error}
            isLoading={fileContent.isLoading}
            shikiTheme={shikiTheme}
            onOpenFile={onOpenFile}
            onRemove={onRemoveExcerpt}
          />
        );
      })}
    </div>
  );
});
