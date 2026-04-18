import React from 'react';

import { MonacoMobileChrome } from './MonacoMobileChrome';
import { MonacoMobileEditable } from './MonacoMobileEditable';
import { MonacoMobileReadonly } from './MonacoMobileReadonly';

/** Theme name registered by monacoThemeBridge — kept as a constant here
 *  so MonacoMobileReadonly doesn't have to import the full bridge module. */
const OUROBOROS_THEME = 'ouroboros';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--surface-base)',
};

export interface MonacoMobileFallbackProps {
  filePath: string;
  content: string;
  language: string;
  readOnly: boolean;
  onChange?: (value: string) => void;
}

/**
 * MonacoMobileFallback — lightweight editor surface for phone viewports.
 *
 * Rendered by ContentRouter when:
 *   useViewportBreakpoint() === 'phone' AND layout.mobilePrimary === true
 *
 * Read-only path  → <pre> with monaco.editor.colorizeElement() (no workers)
 * Editable path   → <textarea> with monospace font (font-size:16px prevents iOS zoom)
 *
 * Desktop path is completely unchanged — this component is never mounted there.
 */
export function MonacoMobileFallback({
  content,
  language,
  readOnly,
  onChange,
}: MonacoMobileFallbackProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      <MonacoMobileChrome />
      {readOnly ? (
        <MonacoMobileReadonly
          content={content}
          language={language}
          monacoTheme={OUROBOROS_THEME}
        />
      ) : (
        <MonacoMobileEditable content={content} onChange={onChange} />
      )}
    </div>
  );
}
