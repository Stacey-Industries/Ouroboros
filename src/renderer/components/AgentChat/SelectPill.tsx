/**
 * SelectPill — Custom styled dropdown replacing native <select> for glass compatibility.
 *
 * Native <select>/<option> elements can't be styled on Windows — the OS renders the
 * dropdown list, ignoring CSS. This component renders a button + portal-mounted menu
 * that inherits the glass surface tokens, matching the rest of the IDE.
 *
 * The menu is portaled to document.body so it escapes any overflow:hidden ancestors.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type OptionItem = { value: string; label: string };
type OptionGroup = { label: string; options: OptionItem[] };

export interface SelectPillProps {
  label: string;
  value: string;
  options?: ReadonlyArray<OptionItem>;
  groups?: OptionGroup[];
  defaultOption?: OptionItem;
  onChange: (value: string) => void;
  title?: string;
}

function getDisplayLabel(
  value: string,
  options?: ReadonlyArray<OptionItem>,
  groups?: OptionGroup[],
  defaultOption?: OptionItem,
): string {
  if (defaultOption && value === defaultOption.value) return defaultOption.label;
  if (options) {
    const match = options.find((o) => o.value === value);
    if (match) return match.label;
  }
  if (groups) {
    for (const g of groups) {
      const match = g.options.find((o) => o.value === value);
      if (match) return match.label;
    }
  }
  return value || 'Default';
}

export function SelectPill(props: SelectPillProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const updateMenuPos = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 4,
      width: rect.width,
    });
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) updateMenuPos();
      return !prev;
    });
  }, [updateMenuPos]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    function handleWindowChange(): void {
      updateMenuPos();
    }
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [open, updateMenuPos]);

  const handleSelect = useCallback((value: string) => {
    setOpen(false);
    props.onChange(value);
  }, [props.onChange]);

  const displayLabel = getDisplayLabel(props.value, props.options, props.groups, props.defaultOption);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="items-center gap-1 text-[11px] transition-colors duration-150 hover:bg-[rgba(128,128,128,0.15)]"
        style={{
          display: 'inline-flex',
          width: 'fit-content',
          flex: '0 0 auto',
          borderRadius: '9999px',
          padding: '2px 18px',
          fontFamily: 'var(--font-ui)',
        }}
        title={props.title ?? displayLabel}
      >
        <span className="text-text-semantic-primary">{displayLabel}</span>
        <ChevronUp />
      </button>
      {open && menuPos && createPortal(
        <SelectPillMenu
          ref={menuRef}
          options={props.options}
          groups={props.groups}
          defaultOption={props.defaultOption}
          value={props.value}
          onSelect={handleSelect}
          style={{ position: 'fixed', left: menuPos.left, bottom: menuPos.bottom, width: menuPos.width }}
        />,
        document.body,
      )}
    </>
  );
}

function ChevronUp(): React.ReactElement {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 opacity-50">
      <path d="M2 5l2-2 2 2" />
    </svg>
  );
}

const SelectPillMenu = React.forwardRef<HTMLDivElement, {
  options?: ReadonlyArray<OptionItem>;
  groups?: OptionGroup[];
  defaultOption?: OptionItem;
  value: string;
  onSelect: (value: string) => void;
  style?: React.CSSProperties;
}>(function SelectPillMenu(props, ref) {
  return (
    <div
      ref={ref}
      role="listbox"
      className="z-[9999] max-h-[280px] overflow-y-auto overflow-x-hidden rounded-lg border border-border-semantic bg-surface-overlay py-1 shadow-xl"
      style={{ backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)', ...props.style }}
    >
      {props.defaultOption && (
        <SelectPillItem
          item={props.defaultOption}
          selected={props.value === props.defaultOption.value}
          onSelect={props.onSelect}
        />
      )}
      {props.groups?.map((group) => (
        <div key={group.label}>
          <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-text-semantic-faint">
            {group.label}
          </div>
          {group.options.map((item) => (
            <SelectPillItem
              key={item.value}
              item={item}
              selected={props.value === item.value}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      ))}
      {props.options?.map((item) => (
        <SelectPillItem
          key={item.value}
          item={item}
          selected={props.value === item.value}
          onSelect={props.onSelect}
        />
      ))}
    </div>
  );
});

function SelectPillItem(props: {
  item: OptionItem;
  selected: boolean;
  onSelect: (value: string) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.item.value)}
      className={`block px-3 py-1.5 text-left text-[11px] truncate transition-colors duration-75 ${
        props.selected
          ? 'bg-interactive-accent text-text-semantic-on-accent'
          : 'text-text-semantic-primary hover:bg-interactive-muted'
      }`}
    >
      {props.item.label}
    </button>
  );
}
