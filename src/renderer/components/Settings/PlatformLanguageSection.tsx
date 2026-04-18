/**
 * PlatformLanguageSection.tsx — Wave 38 Phase G.
 *
 * Language picker subsection for the Platform settings tab.
 * Reads config.platform.language and writes via useLocale().setLanguage.
 * All t() consumers re-render on language change because useLocale reads
 * config.platform.language from useConfig state (which triggers re-renders
 * via the optimistic-update setState in useConfig.set).
 */

import React from 'react';

import type { LocaleCode } from '../../i18n';
import { t } from '../../i18n';
import { useLocale } from '../../i18n/useLocale';
import { SectionLabel } from './settingsStyles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LanguageOptionProps {
  value: LocaleCode;
  label: string;
  selected: boolean;
  onSelect: (code: LocaleCode) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LanguageOption({ value, label, selected, onSelect }: LanguageOptionProps): React.ReactElement {
  const id = `lang-${value}`;
  return (
    <label htmlFor={id} style={radioLabelStyle}>
      <input
        type="radio"
        id={id}
        name="language"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        style={radioInputStyle}
      />
      <span style={radioTextStyle}>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Exported subsection
// ---------------------------------------------------------------------------

export function PlatformLanguageSection(): React.ReactElement {
  const { language, setLanguage } = useLocale();

  return (
    <section style={sectionStyle}>
      <SectionLabel>{t('settings.language.label')}</SectionLabel>
      <div style={radioGroupStyle} role="radiogroup" aria-label={t('settings.language.label')}>
        <LanguageOption
          value="en"
          label={t('settings.language.english')}
          selected={language === 'en'}
          onSelect={setLanguage}
        />
        <LanguageOption
          value="es"
          label={t('settings.language.spanish')}
          selected={language === 'es'}
          onSelect={setLanguage}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '10px' };
const radioGroupStyle: React.CSSProperties = { display: 'flex', gap: '20px', paddingTop: '4px' };
const radioLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' };
const radioInputStyle: React.CSSProperties = { accentColor: 'var(--interactive-accent)', cursor: 'pointer' };
const radioTextStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-primary)' };
