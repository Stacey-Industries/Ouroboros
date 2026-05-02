import React from 'react';

import type { ContextItem } from '../../hooks/useContextPreview';
import { isToggleableKind } from '../../hooks/useContextPreview';

function ManagedBadge(): React.ReactElement {
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] text-text-semantic-faint border border-border-subtle"
      title="Managed by Claude CLI — cannot be toggled"
    >
      managed
    </span>
  );
}

function DisabledBadge(): React.ReactElement {
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] text-text-semantic-faint border border-border-subtle"
      title="MCP server is disabled — not active in this session"
    >
      disabled
    </span>
  );
}

function isToggleableItem(item: ContextItem): boolean {
  if (!isToggleableKind(item.kind)) return false;
  if (item.kind !== 'rule') return true;
  return item.id.startsWith('rule:global:') || item.id.startsWith('rule:project:');
}

function ItemRowControl(props: {
  item: ContextItem;
  disabled: boolean;
  onToggle?: (id: string) => void;
}): React.ReactElement {
  const { item, disabled, onToggle } = props;
  if (!isToggleableItem(item)) return <ManagedBadge />;
  return (
    <input
      type="checkbox"
      checked={!disabled}
      onChange={() => onToggle?.(item.id)}
      aria-label={`Toggle ${item.label}`}
      data-testid={`context-item-checkbox-${item.id}`}
      className="shrink-0 accent-interactive-accent"
    />
  );
}

export { isToggleableItem };

export function ItemRow(props: {
  item: ContextItem;
  disabled: boolean;
  onToggle?: (id: string) => void;
}): React.ReactElement {
  const { item, disabled, onToggle } = props;
  const dimmed = isToggleableItem(item) && disabled;
  return (
    <div
      className={['flex items-center gap-2 px-3 py-1 text-[11px]', dimmed ? 'opacity-40' : ''].join(' ')}
    >
      <ItemRowControl item={item} disabled={disabled} onToggle={onToggle} />
      <span className="flex-1 truncate text-text-semantic-primary" title={item.label}>
        {item.label}
      </span>
      {item.serverDisabled && <DisabledBadge />}
      {item.detail && !item.serverDisabled && (
        <span className="shrink-0 text-text-semantic-faint" title={item.detail}>
          {item.detail}
        </span>
      )}
      <span className="shrink-0 tabular-nums text-text-semantic-faint">
        ~{item.estimatedTokens}
      </span>
    </div>
  );
}
