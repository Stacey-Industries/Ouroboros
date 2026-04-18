/**
 * AwesomeRefSettingsPane.tsx — Settings entry point for Awesome Ouroboros.
 *
 * Wave 37 Phase E. Rendered under Settings → AI Agents → Awesome Ouroboros.
 * Acts as a launcher — the actual panel opens as a modal overlay.
 * Uses inline CSSProperties (settings directory convention — no Tailwind).
 */

import React from 'react';

import { OPEN_AWESOME_REF_EVENT } from '../../hooks/appEventNames';
import { claudeSectionHeaderTextStyle, claudeSectionRootStyle } from './claudeSectionContentStyles';
import { SectionLabel } from './settingsStyles';

// ── Styles ────────────────────────────────────────────────────────────────────

const descStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-semantic-secondary)',
  lineHeight: 1.6,
  marginBottom: '20px',
  maxWidth: '520px',
};

const openButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '13px',
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--interactive-accent)',
  color: 'var(--text-on-accent)',
  cursor: 'pointer',
};

const categoryListStyle: React.CSSProperties = {
  marginTop: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const categoryItemStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-semantic-secondary)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const bulletStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: 'var(--interactive-accent)',
  flexShrink: 0,
};

// ── Data ──────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: 'Hooks', desc: 'Shell scripts for PreToolUse / PostToolUse / PostSessionStop events' },
  { label: 'Slash commands', desc: 'Prompt templates installable as global ~/.claude/commands/ files' },
  { label: 'MCP configs', desc: 'Stub JSON snippets for popular MCP servers (Linear, GitHub, Slack)' },
  { label: 'Rules', desc: 'CLAUDE.md rule blocks — copy into your global or project rules file' },
  { label: 'Skills', desc: 'Reusable prompt instructions — install as global ~/.claude/commands/ files' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function openAwesomeRef(): void {
  window.dispatchEvent(new CustomEvent(OPEN_AWESOME_REF_EVENT));
}

function CategoryRow({ label, desc }: { label: string; desc: string }): React.ReactElement {
  return (
    <div style={categoryItemStyle}>
      <span style={bulletStyle} />
      <span><strong>{label}</strong> — {desc}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AwesomeRefSettingsPane(): React.ReactElement {
  return (
    <div style={claudeSectionRootStyle}>
      <h2 style={claudeSectionHeaderTextStyle}>Awesome Ouroboros</h2>

      <SectionLabel>Curated in-app reference</SectionLabel>

      <p style={descStyle}>
        A hand-curated collection of hooks, slash commands, MCP configs, rules,
        and skills — shipped with the app and searchable by keyword or category.
        Each entry has a copy-to-clipboard button; rules and skills can be installed
        directly into your global Claude Code config.
      </p>

      <button style={openButtonStyle} onClick={openAwesomeRef}>
        Open Awesome Ouroboros
      </button>

      <div style={categoryListStyle}>
        {CATEGORIES.map(({ label, desc }) => (
          <CategoryRow key={label} label={label} desc={desc} />
        ))}
      </div>
    </div>
  );
}
