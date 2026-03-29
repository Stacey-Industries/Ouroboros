import React, { memo, useCallback } from 'react';

import type { AgentTemplate } from '../../types/electron';

export { ComparePanel } from './ComparePanelSupport';

// ─── Toolbar SVG icons ────────────────────────────────────────────────────────

export function CostIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 2V14" strokeLinecap="round" />
      <path
        d="M5.5 4.5C5.5 4.5 6.5 3.5 8 3.5C9.5 3.5 10.5 4.3 10.5 5.5C10.5 6.7 9.5 7.2 8 7.5C6.5 7.8 5.5 8.3 5.5 9.5C5.5 10.7 6.5 11.5 8 11.5C9.5 11.5 10.5 10.5 10.5 10.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MultiSessionIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="5" height="6" rx="1" />
      <rect x="10" y="1" width="5" height="6" rx="1" />
      <rect x="1" y="9" width="5" height="6" rx="1" />
      <rect x="10" y="9" width="5" height="6" rx="1" />
    </svg>
  );
}

export function CompareIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="1" y="3" width="6" height="10" rx="1" />
      <rect x="9" y="3" width="6" height="10" rx="1" />
    </svg>
  );
}

// ─── PreviousSessionsHeaderChevron ────────────────────────────────────────────

export function PreviousSessionsHeaderChevron({
  collapsed,
}: {
  collapsed: boolean;
}): React.ReactElement<any> {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="text-text-semantic-faint"
      style={{
        transform: collapsed ? 'none' : 'rotate(90deg)',
        transition: 'transform 150ms ease',
        flexShrink: 0,
      }}
    >
      <path
        d="M3 1.5L7 5L3 8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── SearchInput + ClearFilterButton ─────────────────────────────────────────

const ClearFilterButton = memo(function ClearFilterButton({
  onClear,
}: {
  onClear: () => void;
}): React.ReactElement<any> {
  return (
    <button
      onClick={onClear}
      className="shrink-0 flex items-center justify-center rounded text-text-semantic-faint"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = 'var(--text-faint)';
      }}
      title="Clear filter"
      aria-label="Clear filter"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
});

export const SearchInput = memo(function SearchInput({
  onChange,
  value,
}: {
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement<any> {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange],
  );

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        className="text-text-semantic-faint"
        style={{ flexShrink: 0 }}
      >
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Filter sessions and tools..."
        className="flex-1 bg-transparent text-[11px] outline-none text-text-semantic-primary"
        style={{ caretColor: 'var(--interactive-accent)', fontFamily: 'var(--font-ui)' }}
        aria-label="Filter agent sessions"
      />
      {value ? <ClearFilterButton onClear={() => onChange('')} /> : null}
    </div>
  );
});

// ─── QuickActionBar ───────────────────────────────────────────────────────────

const QuickActionButton = memo(function QuickActionButton({
  onClick,
  template,
}: {
  onClick: () => void;
  template: AgentTemplate;
}): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
      style={{
        background: 'transparent',
        border: '1px solid var(--border-default)',
        color: 'var(--text-muted)',
        fontSize: '10px',
        fontFamily: 'var(--font-ui)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--surface-raised)';
        event.currentTarget.style.color = 'var(--text-primary)';
        event.currentTarget.style.borderColor = 'var(--interactive-accent)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
        event.currentTarget.style.color = 'var(--text-muted)';
        event.currentTarget.style.borderColor = 'var(--border-default)';
      }}
      title={template.promptTemplate}
    >
      {template.icon ? <span>{template.icon}</span> : null}
      <span>{template.name}</span>
    </button>
  );
});

export const QuickActionBar = memo(function QuickActionBar({
  onExecuteTemplate,
  templates,
}: {
  onExecuteTemplate: (template: AgentTemplate) => void;
  templates: AgentTemplate[];
}): React.ReactElement<any> | null {
  if (templates.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[10px] font-medium shrink-0 text-text-semantic-faint">Quick:</span>
      {templates.map((template) => (
        <QuickActionButton
          key={template.id}
          template={template}
          onClick={() => onExecuteTemplate(template)}
        />
      ))}
    </div>
  );
});
