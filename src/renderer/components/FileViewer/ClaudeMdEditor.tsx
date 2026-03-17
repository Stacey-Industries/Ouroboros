import React, { memo } from 'react';
import { ClaudeMdEditorChrome } from './ClaudeMdEditor.chrome';
import { useClaudeMdEditorModel } from './ClaudeMdEditor.model';

export type { ClaudeMdSection, SectionType } from './ClaudeMdEditor.utils';
export { parseClaudeMdSections } from './ClaudeMdEditor.utils';

export interface ClaudeMdEditorProps {
  content: string;
  savedContent: string;
  filePath: string;
  themeId: string;
  projectRoot?: string | null;
  onSave: (content: string) => void;
  onContentChange: (content: string) => void;
}

export const ClaudeMdEditor = memo(function ClaudeMdEditor({
  content,
  savedContent,
  filePath,
  themeId,
  projectRoot,
  onSave,
  onContentChange,
}: ClaudeMdEditorProps): React.ReactElement {
  const model = useClaudeMdEditorModel({ content, savedContent, filePath, onContentChange, onSave });
  return <ClaudeMdEditorChrome content={content} filePath={filePath} model={model} projectRoot={projectRoot} themeId={themeId} />;
});
