import React from 'react';

import type { ThemeEditorInput } from './ThemeEditor.model';
import { useThemeEditorModel } from './ThemeEditor.model';
import { ThemeEditorView } from './ThemeEditor.parts';

export type ThemeEditorProps = ThemeEditorInput;

export function ThemeEditor(props: ThemeEditorProps): React.ReactElement<any> {
  const model = useThemeEditorModel(props);
  return <ThemeEditorView {...model} />;
}
