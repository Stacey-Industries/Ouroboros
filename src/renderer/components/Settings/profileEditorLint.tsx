/**
 * profileEditorLint.tsx — Profile lint hook and warning display for ProfileEditor.
 *
 * Wave 26 Phase D. Extracted so ProfileEditor stays under the 300-line ESLint limit.
 */

import React, { useEffect, useRef, useState } from 'react';

import type { Profile, ProfileLintItem } from '../../types/electron';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProfileLint(draft: Partial<Profile>): ProfileLintItem[] {
  const [lints, setLints] = useState<ProfileLintItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!draft.id || !draft.name) { setLints([]); return; }
      window.electronAPI.profileCrud
        .lint({ profile: draft as Profile })
        .then((res) => { if (res.success && res.lints) setLints(res.lints); })
        .catch(() => undefined);
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
   
  }, [draft]);

  return lints;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function lintItemStyle(severity: 'warn' | 'error'): React.CSSProperties {
  return {
    fontSize: '11px',
    padding: '5px 8px',
    borderRadius: '5px',
    background: severity === 'error'
      ? 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))'
      : 'color-mix(in srgb, var(--status-warning) 10%, var(--surface-panel))',
    border: `1px solid var(--status-${severity === 'error' ? 'error' : 'warning'})`,
    marginTop: '2px',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LintWarnings({
  lints,
}: {
  lints: ProfileLintItem[];
}): React.ReactElement | null {
  if (lints.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {lints.map((lint, i) => (
        <div
          key={i}
          className={lint.severity === 'error' ? 'text-status-error' : 'text-status-warning'}
          style={lintItemStyle(lint.severity)}
        >
          {lint.severity === 'error' ? 'Error: ' : 'Warning: '}{lint.message}
        </div>
      ))}
    </div>
  );
}
