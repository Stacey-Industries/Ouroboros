import React from 'react';

import type { AppConfig } from '../../types/electron';
import { KeybindingRow } from './KeybindingRow';
import {
  getEffectiveShortcut,
  KEYBINDING_ACTIONS,
} from './keybindingsData';
import {
  type CaptureModel,
  useKeybindingCapture,
} from './useKeybindingCapture';

const ACTION_CATEGORIES = Array.from(new Set(KEYBINDING_ACTIONS.map((action) => action.category)));

interface KeybindingsSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function KeybindingsSection({
  draft,
  onChange,
}: KeybindingsSectionProps): React.ReactElement {
  const keybindings = draft.keybindings ?? {};
  const capture = useKeybindingCapture(keybindings, onChange);
  return <KeybindingsLayout capture={capture} keybindings={keybindings} />;
}

function KeybindingsLayout({
  capture,
  keybindings,
}: {
  capture: CaptureModel;
  keybindings: Record<string, string>;
}): React.ReactElement {
  return (
    <div style={rootStyle}>
      <KeybindingInstructions />
      {ACTION_CATEGORIES.map((category) => (
        <KeybindingCategory
          key={category}
          capture={capture}
          category={category}
          keybindings={keybindings}
        />
      ))}
      <p className="text-text-semantic-muted" style={footerTextStyle}>
        Keybinding changes take effect immediately after saving. Some shortcuts may not apply
        until the relevant panel or file is active.
      </p>
    </div>
  );
}

function KeybindingCategory({
  capture,
  category,
  keybindings,
}: {
  capture: CaptureModel;
  category: string;
  keybindings: Record<string, string>;
}): React.ReactElement {
  const actions = KEYBINDING_ACTIONS.filter((action) => action.category === category);
  return (
    <section>
      <div className="text-text-semantic-muted" style={categoryLabelStyle}>{category}</div>
      <div style={categoryCardStyle}>
        {actions.map((action, index) => (
          <KeybindingRow
            key={action.id}
            action={action}
            capturedKeys={capture.capturedKeys}
            conflictId={capture.conflictId}
            effectiveShortcut={getEffectiveShortcut(action.id, keybindings)}
            isCapturing={capture.capturingId === action.id}
            isCustomised={action.id in keybindings}
            isLast={index === actions.length - 1}
            onCancel={capture.cancelCapture}
            onCommit={() => capture.commitShortcut(action.id, capture.capturedKeys)}
            onReset={() => capture.resetToDefault(action.id)}
            onStartCapture={() => capture.startCapture(action.id)}
          />
        ))}
      </div>
    </section>
  );
}

function KeybindingInstructions(): React.ReactElement {
  return (
    <p className="text-text-semantic-muted" style={instructionsStyle}>
      Click <strong className="text-text-semantic-primary">Edit</strong> on an action, then press the
      desired key combination. Press <kbd className="text-text-semantic-secondary" style={kbdStyle}>Escape</kbd> to cancel or{' '}
      <kbd className="text-text-semantic-secondary" style={kbdStyle}>Enter</kbd> to confirm.
    </p>
  );
}

const categoryCardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
};

const categoryLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
};

const footerTextStyle: React.CSSProperties = {
  fontSize: '11px',
  marginTop: '4px',
};

const instructionsStyle: React.CSSProperties = {
  fontSize: '12px',
  margin: 0,
};

const kbdStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 7px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
};

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
};
