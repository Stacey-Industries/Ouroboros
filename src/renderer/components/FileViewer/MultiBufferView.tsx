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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-ui)',
        gap: '8px',
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>No excerpts</span>
      <span style={{ fontSize: '0.8125rem' }}>
        Use &quot;Add Excerpt&quot; to compose code from multiple files
      </span>
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
      style={{
        padding: '8px 12px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.875rem',
        fontWeight: 600,
        color: 'var(--text)',
      }}
    >
      {name}
      <span
        style={{
          color: 'var(--text-muted)',
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
        backgroundColor: 'var(--bg)',
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
