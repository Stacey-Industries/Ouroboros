import type { RefObject } from 'react';
import React, { memo } from 'react';

import type { ViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import { ClaudeMdEditor } from './ClaudeMdEditor';
import type { CodeViewProps } from './CodeView';
import { CodeView } from './CodeView';
import { CommitHistory } from './CommitHistory';
import type { ConflictBlock } from './ConflictResolver';
import { ConflictResolver } from './ConflictResolver';
import { DiffView } from './DiffView';
import { InlineEditor } from './InlineEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { MonacoDiffEditor } from './MonacoDiffEditor';
// MonacoEditor kept as legacy fallback — see MonacoEditor.tsx
// import { MonacoEditor } from './MonacoEditor';
import { MonacoEditorHost } from './MonacoEditorHost';
import { MonacoMobileFallback } from './MonacoMobileFallback';
import { detectLanguage } from './monacoSetup';

/**
 * Feature flag: when true, Monaco Editor is used for code views instead of the
 * Shiki-based CodeView + CodeMirror InlineEditor. Set to `false` to revert to
 * the legacy viewers if issues are found.
 */
const USE_MONACO = true;

export interface ContentRouterProps {
  /** Current view mode */
  viewMode: 'code' | 'diff' | 'preview';
  /** Whether edit mode is on */
  editMode: boolean;
  /** Whether this is a CLAUDE.md file */
  isClaudeMd: boolean;
  /** Whether to use enhanced CLAUDE.md editor */
  claudeMdEnhanced: boolean;
  /** File path */
  filePath: string | null;
  /** File content */
  content: string | null;
  /** IDE theme id */
  ideThemeId: string;
  /** Project root */
  projectRoot?: string | null;
  /** Save handler */
  onSave?: (content: string) => void;
  /** Draft content change handler */
  onContentChange?: (content: string) => void;
  /** Show history view */
  showHistory: boolean;
  /** Is markdown file */
  isMarkdown: boolean;
  /** Has diff */
  hasDiff: boolean;
  /** Original content for diff */
  originalContent?: string | null;
  /** Preferred content baseline for diff mode */
  diffBaseContent?: string | null;
  /** Conflict blocks */
  conflictBlocks: ConflictBlock[];
  /** Conflict resolved handler */
  handleConflictResolved: (newContent: string) => void;
  /** Code view props (forwarded when in code mode) */
  codeViewProps: Omit<CodeViewProps, 'scrollRef' | 'codeRef'>;
  scrollRef: RefObject<HTMLDivElement | null>;
  codeRef: RefObject<HTMLDivElement | null>;

  // ── Mobile fallback props ─────────────────────────────────────────────
  /** Current viewport tier from useViewportBreakpoint() */
  viewport?: ViewportBreakpoint;
  /** Whether layout.mobilePrimary is enabled in config */
  mobilePrimaryFlag?: boolean;

  // ── Monaco-specific props ─────────────────────────────────────────────
  /** Callback when editor dirty state changes (content differs from saved) */
  onDirtyChange?: (dirty: boolean) => void;
  /** Word wrap toggle state (drives Monaco wordWrap option) */
  wordWrap?: boolean;
  /** Minimap toggle state (drives Monaco minimap.enabled option) */
  showMinimap?: boolean;
  /** Format document before saving */
  formatOnSave?: boolean;
  /** Show git blame annotations */
  showBlame?: boolean;
}

type ConditionalRenderer = (props: ContentRouterProps) => React.ReactElement | null;

const fullPanelStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const previewPanelStyle: React.CSSProperties = {
  ...fullPanelStyle,
  display: 'flex',
};

const noop = (): void => { };

function renderPanel(
  child: React.ReactElement,
  style: React.CSSProperties = fullPanelStyle,
): React.ReactElement {
  return <div style={style}>{child}</div>;
}

function isMobileFallbackActive(props: ContentRouterProps): boolean {
  return props.viewport === 'phone' && props.mobilePrimaryFlag === true;
}

function renderMobileFallbackEditor(props: ContentRouterProps): React.ReactElement {
  const language = props.filePath ? detectLanguage(props.filePath) : 'plaintext';
  return renderPanel(
    <MonacoMobileFallback
      filePath={props.filePath!}
      content={props.content!}
      language={language}
      readOnly={false}
      onChange={props.onContentChange}
    />,
  );
}

function buildEditorContent(props: ContentRouterProps): React.ReactElement {
  if (props.isClaudeMd && props.claudeMdEnhanced) return renderClaudeMdEditor(props);
  if (isMobileFallbackActive(props)) return renderMobileFallbackEditor(props);
  if (USE_MONACO) return renderMonacoEditor(props);
  return renderInlineEditor(props);
}

function renderClaudeMdEditor(props: ContentRouterProps): React.ReactElement {
  return (
    <ClaudeMdEditor
      content={props.content!}
      savedContent={props.originalContent ?? props.content!}
      filePath={props.filePath!}
      themeId={props.ideThemeId}
      projectRoot={props.projectRoot}
      onSave={props.onSave!}
      onContentChange={props.onContentChange ?? noop}
    />
  );
}

function renderMonacoEditor(props: ContentRouterProps): React.ReactElement {
  return (
    <MonacoEditorHost
      filePath={props.filePath!}
      content={props.content!}
      readOnly={false}
      projectRoot={props.projectRoot}
      onSave={props.onSave!}
      onContentChange={props.onContentChange ?? noop}
      onDirtyChange={props.onDirtyChange ?? noop}
      wordWrap={props.wordWrap}
      showMinimap={props.showMinimap}
      showBlame={props.showBlame}
      formatOnSave={props.formatOnSave}
    />
  );
}

function renderInlineEditor(props: ContentRouterProps): React.ReactElement {
  return (
    <InlineEditor
      content={props.content!}
      savedContent={props.originalContent ?? props.content!}
      filePath={props.filePath!}
      themeId={props.ideThemeId}
      projectRoot={props.projectRoot}
      onSave={props.onSave!}
      onContentChange={props.onContentChange ?? noop}
      onDirtyChange={noop}
    />
  );
}

function renderEditorContent(props: ContentRouterProps): React.ReactElement | null {
  if (!props.editMode || !props.filePath || props.content == null || !props.onSave) return null;
  return renderPanel(buildEditorContent(props));
}

function renderHistoryContent(props: ContentRouterProps): React.ReactElement | null {
  if (!props.showHistory || !props.filePath || !props.projectRoot) {
    return null;
  }

  return renderPanel(<CommitHistory filePath={props.filePath} projectRoot={props.projectRoot} />);
}

function renderPreviewContent(props: ContentRouterProps): React.ReactElement | null {
  if (props.viewMode !== 'preview' || !props.isMarkdown || props.content == null) {
    return null;
  }

  return renderPanel(<MarkdownPreview content={props.content} />, previewPanelStyle);
}

function renderDiffContent(props: ContentRouterProps): React.ReactElement | null {
  const diffBaseContent = props.diffBaseContent ?? props.originalContent ?? null;
  if (props.viewMode !== 'diff' || !props.hasDiff || diffBaseContent == null || props.content == null) {
    return null;
  }

  if (USE_MONACO) {
    const language = props.filePath
      ? detectLanguage(props.filePath)
      : 'plaintext';
    return renderPanel(
      <MonacoDiffEditor
        originalContent={diffBaseContent}
        modifiedContent={props.content}
        language={language}
        filePath={props.filePath ?? undefined}
        readOnly={true}
      />,
    );
  }

  return renderPanel(
    <DiffView originalContent={diffBaseContent} currentContent={props.content} />,
  );
}

function renderConflictContent(props: ContentRouterProps): React.ReactElement | null {
  const hasConflictView = props.conflictBlocks.length > 0 && props.viewMode === 'code';
  if (!hasConflictView || props.content == null || props.filePath == null) {
    return null;
  }

  return renderPanel(
    <ConflictResolver
      content={props.content}
      filePath={props.filePath}
      onResolved={props.handleConflictResolved}
    />,
  );
}

const conditionalRenderers: readonly ConditionalRenderer[] = [
  renderEditorContent,
  renderHistoryContent,
  renderPreviewContent,
  renderDiffContent,
  renderConflictContent,
];

function resolveContent(props: ContentRouterProps): React.ReactElement {
  for (const render of conditionalRenderers) {
    const content = render(props);
    if (content) {
      return content;
    }
  }

  // Default: code view (read-only) — mobile fallback or MonacoEditorHost
  if (props.filePath && props.content != null) {
    if (isMobileFallbackActive(props)) {
      const language = detectLanguage(props.filePath);
      return renderPanel(
        <MonacoMobileFallback
          filePath={props.filePath}
          content={props.content}
          language={language}
          readOnly={true}
        />,
      );
    }
    if (USE_MONACO) {
      return renderPanel(
        <MonacoEditorHost
          filePath={props.filePath}
          content={props.content}
          readOnly={true}
          projectRoot={props.projectRoot}
          onSave={props.onSave}
          onDirtyChange={props.onDirtyChange}
          wordWrap={props.wordWrap}
          showMinimap={props.showMinimap}
          showBlame={props.showBlame}
          diffLines={props.codeViewProps.diffLines}
        />,
      );
    }
  }

  // Legacy: Shiki-based CodeView
  return <CodeView scrollRef={props.scrollRef} codeRef={props.codeRef} {...props.codeViewProps} />;
}

/**
 * Routes between editor, history, preview, diff, conflict, and code views.
 */
export const ContentRouter = memo(function ContentRouter(
  props: ContentRouterProps,
): React.ReactElement {
  return resolveContent(props);
});
