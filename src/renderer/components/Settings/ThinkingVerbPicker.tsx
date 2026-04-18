/**
 * ThinkingVerbPicker.tsx — Settings UI for thinking-verb + spinner customization.
 *
 * Orchestrates ThinkingVerbList (add/remove verbs), single-verb override toggle,
 * and SpinnerPresetPicker. Reads/writes config.theming via useConfig.
 *
 * Wave 35 Phase E.
 */

import React, { useCallback, useMemo } from 'react';

import { useConfig } from '../../hooks/useConfig';
import {
  DEFAULT_SPINNER_CHARS,
  DEFAULT_THINKING_VERBS,
} from '../../themes/thinkingDefaults';
import type { AppConfig } from '../../types/electron';
import { SpinnerPresetPicker } from './SpinnerPresetPicker';
import { ThinkingVerbList } from './ThinkingVerbList';

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '12px', color: 'var(--text-text-semantic-muted)',
};

const panelStyle: React.CSSProperties = {
  padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-panel)',
  border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '14px',
};

const subsectionLabelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600,
  color: 'var(--text-text-semantic-primary)', marginBottom: '6px',
};

const overrideRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
};

const overrideInputStyle: React.CSSProperties = {
  flex: 1, padding: '5px 8px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', fontSize: '12px',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)',
  background: 'transparent', color: 'var(--text-text-semantic-primary)',
  fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-end',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type ConfigSet = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;

function patchTheming(
  set: ConfigSet,
  theming: AppConfig['theming'],
  patch: Partial<NonNullable<AppConfig['theming']>>,
): void {
  void set('theming', { ...(theming ?? {}), ...patch });
}

// ── Model hook ────────────────────────────────────────────────────────────────

function useThinkingVerbPickerModel() {
  const { config, set } = useConfig();
  const theming = config?.theming;
  const verbs: string[] = useMemo(
    () => (theming?.thinkingVerbs && theming.thinkingVerbs.length > 0 ? theming.thinkingVerbs : []),
    [theming?.thinkingVerbs],
  );
  const verbOverride = theming?.verbOverride ?? '';
  const hasOverride = verbOverride.trim().length > 0;
  const spinnerChars = theming?.spinnerChars ?? DEFAULT_SPINNER_CHARS;

  const handleVerbsChange = useCallback((next: string[]) => {
    patchTheming(set, theming, { thinkingVerbs: next });
  }, [set, theming]);

  const handleOverrideToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const override = e.target.checked ? (verbs[0] ?? DEFAULT_THINKING_VERBS[0]) : '';
    patchTheming(set, theming, { verbOverride: override });
  }, [set, theming, verbs]);

  const handleOverrideInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    patchTheming(set, theming, { verbOverride: e.target.value });
  }, [set, theming]);

  const handleSpinnerChange = useCallback((chars: string) => {
    patchTheming(set, theming, { spinnerChars: chars });
  }, [set, theming]);

  const handleReset = useCallback(() => {
    void set('theming', {
      ...(theming ?? {}),
      thinkingVerbs: Array.from(DEFAULT_THINKING_VERBS),
      spinnerChars: DEFAULT_SPINNER_CHARS,
      verbOverride: '',
    });
  }, [set, theming]);

  return {
    verbs, verbOverride, hasOverride, spinnerChars,
    handleVerbsChange, handleOverrideToggle, handleOverrideInput,
    handleSpinnerChange, handleReset,
  };
}

// ── ThinkingVerbPicker ────────────────────────────────────────────────────────

export function ThinkingVerbPicker(): React.ReactElement {
  const m = useThinkingVerbPickerModel();

  return (
    <section data-testid="thinking-verb-picker">
      <div style={sectionLabelStyle}>Thinking Indicator</div>
      <div style={panelStyle}>
        <VerbsSubsection verbs={m.verbs} onVerbsChange={m.handleVerbsChange} />
        <OverrideSubsection
          hasOverride={m.hasOverride} verbOverride={m.verbOverride}
          onToggle={m.handleOverrideToggle} onInput={m.handleOverrideInput}
        />
        <SpinnerSubsection spinnerChars={m.spinnerChars} onSpinnerChange={m.handleSpinnerChange} />
        <button type="button" style={resetButtonStyle}
          onClick={m.handleReset} data-testid="thinking-reset-btn"
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function VerbsSubsection({ verbs, onVerbsChange }: {
  verbs: string[];
  onVerbsChange: (v: string[]) => void;
}): React.ReactElement {
  return (
    <div>
      <div style={subsectionLabelStyle}>Verb rotation</div>
      <ThinkingVerbList verbs={verbs} onChange={onVerbsChange} />
    </div>
  );
}

function OverrideSubsection({ hasOverride, verbOverride, onToggle, onInput }: {
  hasOverride: boolean;
  verbOverride: string;
  onToggle: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <div>
      <div style={subsectionLabelStyle}>Single-verb override</div>
      <div style={overrideRowStyle}>
        <input type="checkbox" id="verb-override-toggle" checked={hasOverride}
          onChange={onToggle} data-testid="override-toggle"
        />
        <label htmlFor="verb-override-toggle" style={{ fontSize: '12px' }}>
          Always use one verb
        </label>
        {hasOverride && (
          <input type="text" style={overrideInputStyle} value={verbOverride} onChange={onInput}
            placeholder="e.g. ruminating" aria-label="Override verb" data-testid="override-input"
          />
        )}
      </div>
    </div>
  );
}

function SpinnerSubsection({ spinnerChars, onSpinnerChange }: {
  spinnerChars: string;
  onSpinnerChange: (chars: string) => void;
}): React.ReactElement {
  return (
    <div>
      <div style={subsectionLabelStyle}>Spinner style</div>
      <SpinnerPresetPicker chars={spinnerChars} onChange={onSpinnerChange} />
    </div>
  );
}
