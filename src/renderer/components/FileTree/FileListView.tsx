import React from 'react';
import { FileListItem } from './FileListItem';
import type { FileListController } from './useFileListController';

const SEARCH_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};

const FILE_RESULTS_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  position: 'relative',
};

type FileListBodyMode = 'empty-project' | 'empty-search' | 'error' | 'loading' | 'results' | 'idle';

function SearchInput({
  controller,
  projectRoot,
}: {
  controller: FileListController;
  projectRoot: string | null;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: '6px 8px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border-muted)',
      }}
    >
      <input
        ref={controller.inputRef}
        type="text"
        value={controller.query}
        onChange={(event) => controller.handleQueryChange(event.target.value)}
        placeholder={projectRoot ? 'Search files...' : 'Open a folder to start'}
        disabled={!projectRoot || controller.isLoading}
        aria-label="Filter files"
        className="selectable"
        style={SEARCH_INPUT_STYLE}
        onFocus={(event) => {
          event.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onBlur={(event) => {
          event.currentTarget.style.borderColor = 'var(--border)';
        }}
      />
    </div>
  );
}

function shouldShowSummary(projectRoot: string | null, controller: FileListController): boolean {
  return !controller.isLoading && !controller.error && Boolean(projectRoot);
}

function Summary({
  query,
  totalFiles,
  filteredCount,
}: {
  query: string;
  totalFiles: number;
  filteredCount: number;
}): React.ReactElement {
  const text = query
    ? `${filteredCount} of ${totalFiles} files`
    : `${totalFiles} files`;

  return (
    <div
      style={{
        padding: '2px 12px',
        fontSize: '0.6875rem',
        color: 'var(--text-faint)',
        flexShrink: 0,
      }}
    >
      {text}
    </div>
  );
}

function SummaryBlock({
  controller,
  projectRoot,
}: {
  controller: FileListController;
  projectRoot: string | null;
}): React.ReactElement | null {
  if (!shouldShowSummary(projectRoot, controller)) {
    return null;
  }

  return (
    <Summary
      query={controller.query}
      totalFiles={controller.allFiles.length}
      filteredCount={controller.filteredItems.length}
    />
  );
}

function Message({
  children,
  color,
  padding,
  textAlign = 'left',
}: {
  children: React.ReactNode;
  color: string;
  padding: string;
  textAlign?: React.CSSProperties['textAlign'];
}): React.ReactElement {
  return (
    <div style={{ padding, color, fontSize: '0.8125rem', textAlign }}>
      {children}
    </div>
  );
}

function VisibleFileItems({
  activeFilePath,
  controller,
  onFileSelect,
}: {
  activeFilePath: string | null;
  controller: FileListController;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  return (
    <>
      {controller.visibleItems.map(({ absoluteIndex, file, ranges }) => (
        <FileListItem
          key={file.path}
          file={file}
          isActive={file.path === activeFilePath}
          isFocused={absoluteIndex === controller.focusIndex}
          matchRanges={ranges}
          onClick={(selectedFile) => onFileSelect(selectedFile.path)}
        />
      ))}
    </>
  );
}

function FileResults({
  activeFilePath,
  controller,
  onFileSelect,
}: {
  activeFilePath: string | null;
  controller: FileListController;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  return (
    <div
      ref={controller.listRef}
      role="listbox"
      aria-label="Files"
      onScroll={controller.handleScroll}
      style={FILE_RESULTS_STYLE}
    >
      <div style={{ height: controller.totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: controller.topOffset,
            left: 0,
            right: 0,
          }}
        >
          <VisibleFileItems
            activeFilePath={activeFilePath}
            controller={controller}
            onFileSelect={onFileSelect}
          />
        </div>
      </div>
    </div>
  );
}

function getBodyMode(
  projectRoot: string | null,
  controller: FileListController,
): FileListBodyMode {
  if (controller.isLoading) {
    return 'loading';
  }

  if (controller.error) {
    return 'error';
  }

  if (!projectRoot) {
    return 'empty-project';
  }

  if (controller.filteredItems.length > 0) {
    return 'results';
  }

  return controller.query ? 'empty-search' : 'idle';
}

function FileListBody({
  activeFilePath,
  controller,
  onFileSelect,
  projectRoot,
}: {
  activeFilePath: string | null;
  controller: FileListController;
  onFileSelect: (filePath: string) => void;
  projectRoot: string | null;
}): React.ReactElement | null {
  switch (getBodyMode(projectRoot, controller)) {
    case 'loading':
      return <Message color="var(--text-muted)" padding="16px 12px">Loading files...</Message>;
    case 'error':
      return <Message color="var(--error)" padding="12px">{controller.error}</Message>;
    case 'empty-project':
      return (
        <Message color="var(--text-faint)" padding="24px 12px" textAlign="center">
          <>No folder open.<br />Use the picker above to open a project.</>
        </Message>
      );
    case 'results':
      return <FileResults activeFilePath={activeFilePath} controller={controller} onFileSelect={onFileSelect} />;
    case 'empty-search':
      return <Message color="var(--text-faint)" padding="16px 12px" textAlign="center">No files match &quot;{controller.query}&quot;</Message>;
    default:
      return null;
  }
}

export function FileListView({
  projectRoot,
  activeFilePath,
  onFileSelect,
  controller,
}: {
  projectRoot: string | null;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  controller: FileListController;
}): React.ReactElement {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onKeyDown={controller.handleKeyDown}
    >
      <SearchInput controller={controller} projectRoot={projectRoot} />
      <SummaryBlock controller={controller} projectRoot={projectRoot} />
      <FileListBody
        activeFilePath={activeFilePath}
        controller={controller}
        onFileSelect={onFileSelect}
        projectRoot={projectRoot}
      />
    </div>
  );
}
