import React from 'react';
import { ThemeEditorView } from './ThemeEditor.parts';
import { useThemeEditorModel } from './ThemeEditor.model';
import type { ThemeEditorInput } from './ThemeEditor.model';

export type ThemeEditorProps = ThemeEditorInput;

export function ThemeEditor(props: ThemeEditorProps): React.ReactElement {
  const model = useThemeEditorModel(props);
  return <ThemeEditorView {...model} />;
}
