import React, { memo } from 'react';

import { disposeMonacoModel as disposeMonacoEditorModel, MonacoEditor, type MonacoEditorHostProps } from './MonacoEditor';

export type { MonacoEditorHostProps } from './MonacoEditor';
export type { KeybindingMode } from './monacoVimMode';

export const MonacoEditorHost = memo(function MonacoEditorHost(props: MonacoEditorHostProps): React.ReactElement<any> {
  return <MonacoEditor {...props} />;
});

export function disposeMonacoModel(filePath: string): void {
  disposeMonacoEditorModel(filePath);
}
