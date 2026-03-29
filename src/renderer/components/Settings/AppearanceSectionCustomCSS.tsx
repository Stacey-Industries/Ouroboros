import React, { useEffect, useMemo, useState } from 'react';

import type { AppConfig } from '../../types/electron';

interface CustomCSSSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '12px',
};

const panelStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '8px',
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '12px',
  lineHeight: 1.6,
  background: 'var(--surface-base)',
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  padding: '10px 12px',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: '5px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
};

const getSaveButtonStyle = (saved: boolean): React.CSSProperties => ({
  padding: '5px 14px',
  borderRadius: '5px',
  border: 'none',
  background: saved ? 'var(--status-success)' : 'var(--interactive-accent)',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 200ms ease',
});

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement<any> {
  return (
    <div className="text-text-semantic-muted" style={sectionLabelStyle}>
      {children}
    </div>
  );
}

function countRuleBlocks(css: string): number {
  const trimmedCss = css.trim();
  return trimmedCss ? (trimmedCss.match(/\{/g) ?? []).length : 0;
}

function useSavedReset(
  saved: boolean,
  setSaved: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  useEffect(() => {
    if (!saved) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setSaved(false), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [saved, setSaved]);
}

function useCustomCSSController({
  customCSS,
  onChange,
}: {
  customCSS: string | undefined;
  onChange: CustomCSSSectionProps['onChange'];
}) {
  const [localCSS, setLocalCSS] = useState(customCSS ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalCSS(customCSS ?? '');
  }, [customCSS]);

  useSavedReset(saved, setSaved);

  const ruleCount = useMemo(() => countRuleBlocks(customCSS ?? ''), [customCSS]);
  const handleSave = (): void => {
    onChange('customCSS', localCSS);
    setSaved(true);
  };
  const handleReset = (): void => {
    setLocalCSS('');
    onChange('customCSS', '');
    setSaved(false);
  };

  return { handleReset, handleSave, localCSS, ruleCount, saved, setLocalCSS };
}

function CustomCSSStatus({ ruleCount }: { ruleCount: number }): React.ReactElement<any> {
  return (
    <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
      {ruleCount > 0
        ? `${ruleCount} rule block${ruleCount === 1 ? '' : 's'} active`
        : 'No custom rules active'}
    </span>
  );
}

function CustomCSSActions({
  onReset,
  onSave,
  ruleCount,
  saved,
}: {
  onReset: () => void;
  onSave: () => void;
  ruleCount: number;
  saved: boolean;
}): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <CustomCSSStatus ruleCount={ruleCount} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onReset} className="text-text-semantic-muted" style={resetButtonStyle}>
          Reset
        </button>
        <button
          onClick={onSave}
          className="text-text-semantic-on-accent"
          style={getSaveButtonStyle(saved)}
        >
          {saved ? 'Saved!' : 'Apply CSS'}
        </button>
      </div>
    </div>
  );
}

function CustomCSSBody({
  localCSS,
  onReset,
  onSave,
  ruleCount,
  saved,
  setLocalCSS,
}: {
  localCSS: string;
  onReset: () => void;
  onSave: () => void;
  ruleCount: number;
  saved: boolean;
  setLocalCSS: React.Dispatch<React.SetStateAction<string>>;
}): React.ReactElement<any> {
  return (
    <div style={panelStyle}>
      <div className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
        Inject custom CSS overrides. Changes apply after saving settings.
      </div>
      <textarea
        value={localCSS}
        onChange={(event) => setLocalCSS(event.target.value)}
        placeholder="/* Add custom CSS here */"
        rows={7}
        spellCheck={false}
        className="text-text-semantic-primary"
        style={textareaStyle}
      />
      <CustomCSSActions onReset={onReset} onSave={onSave} ruleCount={ruleCount} saved={saved} />
    </div>
  );
}

export function CustomCSSSection({ draft, onChange }: CustomCSSSectionProps): React.ReactElement<any> {
  const { handleReset, handleSave, localCSS, ruleCount, saved, setLocalCSS } =
    useCustomCSSController({
      customCSS: draft.customCSS,
      onChange,
    });

  return (
    <section>
      <SectionLabel>Custom CSS</SectionLabel>
      <CustomCSSBody
        localCSS={localCSS}
        onReset={handleReset}
        onSave={handleSave}
        ruleCount={ruleCount}
        saved={saved}
        setLocalCSS={setLocalCSS}
      />
    </section>
  );
}
