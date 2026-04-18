/**
 * ThinkingVerbList.tsx — Editable list of thinking verbs with add/remove.
 *
 * Wave 35 Phase E.
 */

import React, { useCallback, useState } from 'react';

import { DEFAULT_THINKING_VERBS } from '../../themes/thinkingDefaults';

// ── Styles ────────────────────────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '3px 8px', borderRadius: '12px',
  background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)',
  fontSize: '12px', color: 'var(--text-text-semantic-primary)',
};

const removeButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
  lineHeight: 1, color: 'var(--text-text-semantic-muted)', fontSize: '14px',
};

const addRowStyle: React.CSSProperties = { display: 'flex', gap: '6px' };

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '5px 8px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', fontSize: '12px',
};

const addButtonStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)',
  background: 'var(--surface-raised)', color: 'var(--text-text-semantic-primary)',
  fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function VerbChip({ verb, onRemove }: { verb: string; onRemove: (v: string) => void }): React.ReactElement {
  return (
    <span style={chipStyle} data-testid={`verb-chip-${verb}`}>
      {verb}
      <button type="button" style={removeButtonStyle}
        aria-label={`Remove verb ${verb}`} data-testid={`remove-verb-${verb}`}
        onClick={() => onRemove(verb)}
      >
        ×
      </button>
    </span>
  );
}

function AddVerbRow({ input, onChange, onAdd, onKeyDown }: {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}): React.ReactElement {
  return (
    <div style={addRowStyle}>
      <input style={inputStyle} type="text" placeholder="Add a verb…" value={input}
        onChange={onChange} onKeyDown={onKeyDown}
        aria-label="New thinking verb" data-testid="verb-input"
      />
      <button type="button" style={addButtonStyle} onClick={onAdd} data-testid="verb-add-btn">
        Add
      </button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ThinkingVerbListProps {
  verbs: string[];
  onChange: (verbs: string[]) => void;
}

export function ThinkingVerbList({ verbs, onChange }: ThinkingVerbListProps): React.ReactElement {
  const [input, setInput] = useState('');

  const handleRemove = useCallback((verb: string) => {
    onChange(verbs.filter((v) => v !== verb));
  }, [verbs, onChange]);

  const handleAdd = useCallback(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || verbs.includes(trimmed)) { setInput(''); return; }
    onChange([...verbs, trimmed]);
    setInput('');
  }, [input, verbs, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  }, [handleAdd]);

  const displayVerbs = verbs.length > 0 ? verbs : Array.from(DEFAULT_THINKING_VERBS);

  return (
    <div>
      <div style={listStyle} data-testid="verb-chip-list">
        {displayVerbs.map((verb) => (
          <VerbChip key={verb} verb={verb} onRemove={handleRemove} />
        ))}
      </div>
      <AddVerbRow
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onAdd={handleAdd}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
