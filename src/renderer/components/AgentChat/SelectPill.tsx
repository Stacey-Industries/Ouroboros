/**
 * SelectPill — Custom styled dropdown replacing native <select> for glass compatibility.
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
  /** Optional icon component rendered before the label inside the pill button */
  icon?: React.ComponentType<{ size?: number }> | null;
}

function getDisplayLabel(value: string, options?: ReadonlyArray<OptionItem>, groups?: OptionGroup[], defaultOption?: OptionItem): string {
  if (defaultOption && value === defaultOption.value) return defaultOption.label;
  const match = options?.find((option) => option.value === value) ?? groups?.flatMap((group) => group.options).find((option) => option.value === value);
  return match?.label ?? (value || 'Select');
}

function ChevronUp(): React.ReactElement<any> {
  return <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 opacity-50"><path d="M2 5l2-2 2 2" /></svg>;
}

function SelectPillItem({ item, selected, onSelect }: { item: OptionItem; selected: boolean; onSelect: (value: string) => void }): React.ReactElement<any> {
  return (
    <button type="button" onClick={() => onSelect(item.value)} className={`block truncate px-3 py-1.5 text-left text-[11px] transition-colors duration-75 ${selected ? 'bg-interactive-accent text-text-semantic-on-accent' : 'text-text-semantic-primary hover:bg-interactive-muted'}`}>
      {item.label}
    </button>
  );
}

function useSelectPillWindowListeners(args: {
  open: boolean;
  close: () => void;
  updateMenuPos: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
}): void {
  const { open, close, updateMenuPos, buttonRef, menuRef } = args;
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent): void => {
      if (buttonRef.current?.contains(event.target as Node) || menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    const handleKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close(); };
    const handleWindowChange = (): void => updateMenuPos();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [open, close, updateMenuPos, buttonRef, menuRef]);
}

function SelectPillMenu({
  options,
  groups,
  defaultOption,
  value,
  onSelect,
  style,
  ref,
}: {
  options?: ReadonlyArray<OptionItem>;
  groups?: OptionGroup[];
  defaultOption?: OptionItem;
  value: string;
  onSelect: (value: string) => void;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}): React.ReactElement<any> {
  return (
    <div ref={ref} role="listbox" className="z-[9999] max-h-[280px] overflow-x-hidden overflow-y-auto rounded-lg border border-border-semantic bg-surface-overlay py-1 shadow-xl" style={{ backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)', ...style }}>
      {defaultOption && <SelectPillItem item={defaultOption} selected={value === defaultOption.value} onSelect={onSelect} />}
      {groups?.map((group) => (
        <div key={group.label}>
          <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-text-semantic-faint">{group.label}</div>
          {group.options.map((item) => <SelectPillItem key={item.value} item={item} selected={value === item.value} onSelect={onSelect} />)}
        </div>
      ))}
      {options?.map((item) => <SelectPillItem key={item.value} item={item} selected={value === item.value} onSelect={onSelect} />)}
    </div>
  );
}

export function SelectPill({ label: _label, value, options, groups, defaultOption, onChange, title, icon: Icon }: SelectPillProps): React.ReactElement<any> {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const updateMenuPos = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4, width: rect.width });
  }, []);

  const toggle = useCallback(() => setOpen((prev) => (prev ? false : (updateMenuPos(), true))), [updateMenuPos]);
  const handleSelect = useCallback((nextValue: string) => { setOpen(false); onChange(nextValue); }, [onChange]);
  const displayLabel = getDisplayLabel(value, options, groups, defaultOption);
  useSelectPillWindowListeners({ open, close, updateMenuPos, buttonRef, menuRef });

  return (
    <>
      <button type="button" ref={buttonRef} onClick={toggle} aria-expanded={open} aria-haspopup="listbox" aria-label={_label} className="items-center gap-1 text-[11px] transition-colors duration-150 hover:bg-[rgba(128,128,128,0.15)]" style={{ display: 'inline-flex', width: 'fit-content', flex: '0 0 auto', borderRadius: '9999px', padding: '2px 18px', fontFamily: 'var(--font-ui)' }} title={title ?? displayLabel}>
        {Icon && <Icon size={13} />}
        <span className="text-text-semantic-primary">{displayLabel}</span>
        <ChevronUp />
      </button>
      {open && menuPos && createPortal(<SelectPillMenu ref={menuRef} options={options} groups={groups} defaultOption={defaultOption} value={value} onSelect={handleSelect} style={{ position: 'fixed', left: menuPos.left, bottom: menuPos.bottom, width: menuPos.width }} />, document.body)}
    </>
  );
}
