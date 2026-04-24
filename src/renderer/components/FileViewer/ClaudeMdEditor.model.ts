import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  appendTemplate,
  type ClaudeMdSection,
  type ClaudeMdStats,
  formatClaudeMd,
  getClaudeMdStats,
  parseClaudeMdSections,
} from './ClaudeMdEditor.utils';
import type { InlineEditorHandle } from './InlineEditor';

interface UseClaudeMdEditorModelArgs {
  content: string;
  savedContent: string;
  filePath: string;
  onContentChange: (content: string) => void;
  onSave: (content: string) => void;
}

export interface ClaudeMdEditorModel {
  editorRef: React.RefObject<InlineEditorHandle | null>;
  handleFormat: () => void;
  handleContentChange: (content: string) => void;
  handleInsertTemplate: (templateContent: string) => void;
  handleSave: (text: string) => void;
  handleScrollToSection: (section: ClaudeMdSection) => void;
  sections: ClaudeMdSection[];
  savedContent: string;
  showTemplates: boolean;
  stats: ClaudeMdStats;
  toggleTemplates: () => void;
}

function useClaudeMdContent(
  content: string,
  onContentChange: (content: string) => void,
  onSave: (content: string) => void,
): {
  currentContent: string;
  handleContentChange: (text: string) => void;
  handleSave: (text: string) => void;
} {
  const [currentContent, setCurrentContent] = useState(content);

  useEffect(() => {
    setCurrentContent(content);
  }, [content]);

  const handleContentChange = useCallback(
    (text: string) => {
      setCurrentContent(text);
      onContentChange(text);
    },
    [onContentChange],
  );

  const handleSave = useCallback(
    (text: string) => {
      setCurrentContent(text);
      onSave(text);
    },
    [onSave],
  );

  return { currentContent, handleContentChange, handleSave };
}

function useEditorActions(
  editorRef: React.RefObject<InlineEditorHandle | null>,
  currentContent: string,
  filePath: string,
  handleContentChange: (c: string) => void,
) {
  const handleFormat = useCallback(() => {
    handleContentChange(formatClaudeMd(editorRef.current?.getContent() ?? currentContent));
  }, [currentContent, handleContentChange, editorRef]);

  const handleInsertTemplate = useCallback(
    (templateContent: string) => {
      handleContentChange(appendTemplate(editorRef.current?.getContent() ?? currentContent, templateContent));
    },
    [currentContent, handleContentChange, editorRef],
  );

  const handleScrollToSection = useCallback(
    (section: ClaudeMdSection) => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:scroll-to-line', {
          detail: { filePath, line: section.startLine + 1 },
        }),
      );
    },
    [filePath],
  );

  return { handleFormat, handleInsertTemplate, handleScrollToSection };
}

export function useClaudeMdEditorModel({
  content,
  savedContent,
  filePath,
  onContentChange,
  onSave,
}: UseClaudeMdEditorModelArgs): ClaudeMdEditorModel {
  const [showTemplates, setShowTemplates] = useState(false);
  const editorRef = useRef<InlineEditorHandle>(null);
  const { currentContent, handleContentChange, handleSave } = useClaudeMdContent(
    content, onContentChange, onSave,
  );
  const sections = useMemo(() => parseClaudeMdSections(currentContent), [currentContent]);
  const stats = useMemo(() => getClaudeMdStats(currentContent), [currentContent]);
  const { handleFormat, handleInsertTemplate, handleScrollToSection } = useEditorActions(
    editorRef, currentContent, filePath, handleContentChange,
  );
  const toggleTemplates = useCallback(() => setShowTemplates((p) => !p), []);

  return {
    editorRef, handleFormat, handleContentChange, handleInsertTemplate,
    handleSave, handleScrollToSection, sections, savedContent,
    showTemplates, stats, toggleTemplates,
  };
}
