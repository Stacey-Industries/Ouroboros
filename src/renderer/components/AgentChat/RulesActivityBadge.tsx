/**
 * RulesActivityBadge — Compact pill showing how many rules/instructions
 * are loaded in the current agent session, with an expandable popover
 * listing each rule's name, memory type, and file path.
 */

import type { LoadedRule } from '@shared/types/ruleActivity';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RulesActivityBadgeProps {
  rules: LoadedRule[];
}

const MEMORY_TYPE_LABELS: Record<string, string> = {
  User: 'User',
  Project: 'Project',
  Local: 'Local',
  Managed: 'Managed',
};

function getMemoryTypeBadgeClass(memoryType: string): string {
  switch (memoryType) {
    case 'User':
      return 'bg-interactive-accent/20 text-interactive-accent';
    case 'Project':
      return 'bg-status-info/20 text-status-info';
    case 'Local':
      return 'bg-status-warning/20 text-status-warning';
    case 'Managed':
      return 'bg-status-success/20 text-status-success';
    default:
      return 'bg-surface-inset text-text-semantic-muted';
  }
}

function truncatePath(filePath: string, maxLen = 50): string {
  if (filePath.length <= maxLen) return filePath;
  return '...' + filePath.slice(filePath.length - maxLen + 3);
}

function RuleRow({ rule }: { rule: LoadedRule }): React.ReactElement {
  const badgeClass = getMemoryTypeBadgeClass(rule.memoryType);
  const label = MEMORY_TYPE_LABELS[rule.memoryType] ?? rule.memoryType;
  return (
    <div className="flex items-start gap-2 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[11px] font-medium text-text-semantic-primary">
          {rule.name}
        </span>
        <span className="truncate text-[10px] text-text-semantic-faint" title={rule.filePath}>
          {truncatePath(rule.filePath)}
        </span>
      </div>
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${badgeClass}`}>
        {label}
      </span>
    </div>
  );
}

function RulesPopover(
  { rules, style, ref }: { rules: LoadedRule[]; style?: React.CSSProperties; ref?: React.Ref<HTMLDivElement> },
): React.ReactElement {
  return (
    <div
      ref={ref}
      className="z-[9999] max-h-[320px] w-[300px] overflow-y-auto rounded-lg border border-border-semantic-subtle bg-surface-overlay py-1 shadow-xl"
      style={style}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-semantic-faint">
        Loaded Rules ({rules.length})
      </div>
      {rules.map((rule) => (
        <RuleRow key={rule.filePath + rule.loadedAt} rule={rule} />
      ))}
    </div>
  );
}

function usePopoverDismiss(args: {
  open: boolean;
  close: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
}): void {
  const { open, close, buttonRef, menuRef } = args;
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent): void => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, buttonRef, menuRef]);
}

const pillStyle: React.CSSProperties = { borderRadius: '9999px', padding: '2px 10px', fontFamily: 'var(--font-ui)' };

function BadgePillButton(props: {
  count: number;
  open: boolean;
  onClick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}): React.ReactElement {
  return (
    <button
      type="button"
      ref={props.buttonRef}
      onClick={props.onClick}
      aria-expanded={props.open}
      className="inline-flex items-center gap-1 text-[11px] text-text-semantic-secondary transition-colors duration-150 hover:bg-[rgba(128,128,128,0.15)]"
      style={pillStyle}
      title={`${props.count} rule${props.count === 1 ? '' : 's'} loaded`}
    >
      <span className="text-text-semantic-primary">{props.count}</span>
      <span>rule{props.count === 1 ? '' : 's'}</span>
    </button>
  );
}

function useRulesPopoverState() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const updatePos = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverWidth = 300;
    const maxLeft = window.innerWidth - popoverWidth - 8;
    setPos({ left: Math.min(rect.left, maxLeft), bottom: window.innerHeight - rect.top + 4 });
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => (prev ? false : (updatePos(), true)));
  }, [updatePos]);

  usePopoverDismiss({ open, close, buttonRef, menuRef });

  return { open, pos, buttonRef, menuRef, toggle };
}

export function RulesActivityBadge({ rules }: RulesActivityBadgeProps): React.ReactElement | null {
  const { open, pos, buttonRef, menuRef, toggle } = useRulesPopoverState();

  if (rules.length === 0) return null;

  return (
    <>
      <BadgePillButton count={rules.length} open={open} onClick={toggle} buttonRef={buttonRef} />
      {open && pos && createPortal(
        <RulesPopover ref={menuRef} rules={rules} style={{ position: 'fixed', left: pos.left, bottom: pos.bottom }} />,
        document.body,
      )}
    </>
  );
}
