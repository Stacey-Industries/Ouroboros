/**
 * AgentContextPacketSection.tsx — Context packet size radio group (Full / Lean).
 * Wave 31 Phase E.
 */
import type { CSSProperties } from 'react';
import React from 'react';

import type { AppConfig } from '../../types/electron';
import { claudeSectionSectionDescriptionStyle } from './claudeSectionContentStyles';
import { SectionLabel } from './settingsStyles';

export type ContextSettings = NonNullable<AppConfig['context']>;

interface ContextPacketSectionProps {
  contextSettings: ContextSettings;
  updateContext: <K extends keyof ContextSettings>(field: K, value: ContextSettings[K]) => void;
}

export function AgentContextPacketSection({
  contextSettings,
  updateContext,
}: ContextPacketSectionProps): React.ReactElement {
  const mode = contextSettings.packetMode ?? 'full';
  return (
    <section>
      <SectionLabel>Context Packet Size</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Full includes the complete project structure block. Lean drops it and caps relevant files to
        6, reducing prompt tokens for faster responses on simple tasks.
      </p>
      <div style={packetModeRowStyle}>
        {(['full', 'lean'] as const).map((value) => (
          <button
            key={value}
            onClick={() => updateContext('packetMode', value)}
            aria-pressed={mode === value}
            style={packetModeButtonStyle(mode === value)}
          >
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
    </section>
  );
}

const packetModeRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginTop: '8px',
};

function packetModeButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '4px 16px',
    borderRadius: '4px',
    border: active ? '1px solid var(--interactive-accent)' : '1px solid var(--border-semantic)',
    background: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-text-semantic-primary)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  };
}
