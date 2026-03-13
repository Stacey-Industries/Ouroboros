import React, { memo } from 'react';
import { ClaudeMdEditorChrome } from './ClaudeMdEditor.chrome';
import { useClaudeMdEditorModel } from './ClaudeMdEditor.model';

export type { ClaudeMdSection, SectionType } from './ClaudeMdEditor.utils';
export { parseClaudeMdSections } from './ClaudeMdEditor.utils';

export interface ClaudeMdEditorProps {
  content: string;
  filePath: string;
  themeId: string;
  projectRoot?: string | null;
  onSave: (content: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export const ClaudeMdEditor = memo(function ClaudeMdEditor({
  content,
  filePath,
  themeId,
  projectRoot,
  onSave,
  onDirtyChange,
}: ClaudeMdEditorProps): React.ReactElement {
  const model = useClaudeMdEditorModel({ content, filePath, onDirtyChange, onSave });
  return <ClaudeMdEditorChrome content={content} filePath={filePath} model={model} projectRoot={projectRoot} themeId={themeId} />;
});
