import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InlineEditorHandle } from './InlineEditor';
import {
  appendTemplate,
  formatClaudeMd,
  getClaudeMdStats,
  parseClaudeMdSections,
  type ClaudeMdSection,
  type ClaudeMdStats,
} from './ClaudeMdEditor.utils';

interface UseClaudeMdEditorModelArgs {
  content: string;
  filePath: string;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: string) => void;
}

export interface ClaudeMdEditorModel {
  editorRef: React.RefObject<InlineEditorHandle | null>;
  handleDirtyChange: (dirty: boolean) => void;
  handleFormat: () => void;
  handleInsertTemplate: (templateContent: string) => void;
  handleSave: (text: string) => void;
  handleScrollToSection: (section: ClaudeMdSection) => void;
  sections: ClaudeMdSection[];
  showTemplates: boolean;
  stats: ClaudeMdStats;
  toggleTemplates: () => void;
}

function useClaudeMdContent(
  content: string,
  onSave: (content: string) => void,
): { currentContent: string; handleSave: (text: string) => void } {
  const [currentContent, setCurrentContent] = useState(content);

  useEffect(() => {
    setCurrentContent(content);
  }, [content]);

  const handleSave = useCallback((text: string) => {
    setCurrentContent(text);
    onSave(text);
  }, [onSave]);

  return { currentContent, handleSave };
}

export function useClaudeMdEditorModel({
  content,
  filePath,
  onDirtyChange,
  onSave,
}: UseClaudeMdEditorModelArgs): ClaudeMdEditorModel {
  const [showTemplates, setShowTemplates] = useState(false);
  const editorRef = useRef<InlineEditorHandle>(null);
  const { currentContent, handleSave } = useClaudeMdContent(content, onSave);

  const sections = useMemo(() => parseClaudeMdSections(currentContent), [currentContent]);
  const stats = useMemo(() => getClaudeMdStats(currentContent), [currentContent]);
  const handleDirtyChange = useCallback((dirty: boolean) => onDirtyChange(dirty), [onDirtyChange]);

  const handleFormat = useCallback(() => {
    const liveContent = editorRef.current?.getContent() ?? content;
    handleSave(formatClaudeMd(liveContent));
  }, [content, handleSave]);

  const handleInsertTemplate = useCallback((templateContent: string) => {
    const liveContent = editorRef.current?.getContent() ?? content;
    handleSave(appendTemplate(liveContent, templateContent));
  }, [content, handleSave]);

  const handleScrollToSection = useCallback((section: ClaudeMdSection) => {
    window.dispatchEvent(new CustomEvent('agent-ide:scroll-to-line', { detail: { filePath, line: section.startLine + 1 } }));
  }, [filePath]);

  const toggleTemplates = useCallback(() => {
    setShowTemplates((previous) => !previous);
  }, []);

  return {
    editorRef,
    handleDirtyChange,
    handleFormat,
    handleInsertTemplate,
    handleSave,
    handleScrollToSection,
    sections,
    showTemplates,
    stats,
    toggleTemplates,
  };
}
