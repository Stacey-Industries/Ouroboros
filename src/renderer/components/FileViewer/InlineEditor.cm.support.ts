import type { LspDiagnostic } from '../../types/electron';

/** Maps LSP completion kinds to CodeMirror completion types. */
export const completionKindMap: Record<string, string> = {
  method: 'method',
  function: 'function',
  constructor: 'class',
  field: 'property',
  variable: 'variable',
  class: 'class',
  interface: 'interface',
  module: 'namespace',
  property: 'property',
  unit: 'constant',
  value: 'constant',
  enum: 'enum',
  keyword: 'keyword',
  snippet: 'text',
  color: 'constant',
  file: 'variable',
  reference: 'variable',
  folder: 'variable',
  enumMember: 'enum',
  constant: 'constant',
  struct: 'class',
  event: 'variable',
  operator: 'keyword',
  typeParameter: 'type',
};

export const severityMap: Record<LspDiagnostic['severity'], 'error' | 'warning' | 'info'> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'info',
};

export function getLspCompletionType(kind: string): string {
  return completionKindMap[kind] ?? 'text';
}

export function getLspSeverity(severity: LspDiagnostic['severity']): 'error' | 'warning' | 'info' {
  return severityMap[severity] ?? 'info';
}
