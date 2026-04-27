/**
 * SelectPill.parts.tsx — Presentational sub-components for SelectPill.
 * Extracted to keep SelectPill.tsx under ESLint line limits.
 */
import React from 'react';

type OptionItem = { value: string; label: string };
export type OptionGroup = { label: string; options: OptionItem[] };

export function SelectPillItem({
  item,
  selected,
  onSelect,
}: {
  item: OptionItem;
  selected: boolean;
  onSelect: (value: string) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.value)}
      className={`block truncate px-3 py-1.5 text-left text-[11px] transition-colors duration-75 ${selected ? 'bg-interactive-accent text-text-semantic-on-accent' : 'text-text-semantic-primary hover:bg-interactive-muted'}`}
    >
      {item.label}
    </button>
  );
}

export function SelectPillGroupItems({
  groups,
  value,
  onSelect,
}: {
  groups: OptionGroup[];
  value: string;
  onSelect: (v: string) => void;
}): React.ReactElement {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-text-semantic-faint">
            {group.label}
          </div>
          {group.options.map((item) => (
            <SelectPillItem
              key={item.value}
              item={item}
              selected={value === item.value}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </>
  );
}

interface SelectPillMenuItemsProps {
  options?: ReadonlyArray<OptionItem>;
  groups?: OptionGroup[];
  defaultOption?: OptionItem;
  value: string;
  onSelect: (value: string) => void;
}

export function SelectPillMenuItems({
  options,
  groups,
  defaultOption,
  value,
  onSelect,
}: SelectPillMenuItemsProps): React.ReactElement {
  return (
    <>
      {defaultOption && (
        <SelectPillItem
          item={defaultOption}
          selected={value === defaultOption.value}
          onSelect={onSelect}
        />
      )}
      {groups && <SelectPillGroupItems groups={groups} value={value} onSelect={onSelect} />}
      {options?.map((item) => (
        <SelectPillItem
          key={item.value}
          item={item}
          selected={value === item.value}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export interface SelectPillMenuProps {
  options?: ReadonlyArray<OptionItem>;
  groups?: OptionGroup[];
  defaultOption?: OptionItem;
  value: string;
  onSelect: (value: string) => void;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}

export function SelectPillMenu({
  options,
  groups,
  defaultOption,
  value,
  onSelect,
  style,
  ref,
}: SelectPillMenuProps): React.ReactElement {
  return (
    // WebkitAppRegion: 'no-drag' ensures this portaled popover receives pointer
    // events even when it renders over a window-drag region (e.g. the title bar).
    // data-select-pill-menu triggers the frosted-glass rule in globals.css.
    <div
      ref={ref}
      role="listbox"
      data-select-pill-menu
      className="z-[9999] max-h-[280px] overflow-x-hidden overflow-y-auto rounded-lg border border-border-semantic bg-surface-overlay py-1 shadow-xl"
      style={{
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        ...style,
        ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties),
      }}
    >
      <SelectPillMenuItems
        options={options}
        groups={groups}
        defaultOption={defaultOption}
        value={value}
        onSelect={onSelect}
      />
    </div>
  );
}
