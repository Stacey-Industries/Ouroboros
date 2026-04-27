/**
 * @vitest-environment jsdom
 *
 * WorkbenchMenuBar.parts — smoke tests (Wave 59 Phase C).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MenuDefinition, MenuItem } from '../TitleBar.menus';
import {
  WorkbenchDropdown,
  WorkbenchItemRow,
  WorkbenchMenuButton,
} from './WorkbenchMenuBar.parts';

afterEach(cleanup);

const ITEM: MenuItem = { label: 'New Session', shortcut: 'Ctrl+Shift+N', action: vi.fn() };
const DIVIDER: MenuItem = { label: '', divider: true };
const MENU: MenuDefinition = { label: 'File', items: [ITEM, DIVIDER, { label: 'Exit' }] };

describe('WorkbenchItemRow', () => {
  it('renders the item label and shortcut', () => {
    render(
      <WorkbenchItemRow
        item={ITEM}
        onClose={vi.fn()}
        isHighlighted={false}
        onMouseEnterItem={vi.fn()}
        itemRef={() => {}}
      />,
    );
    expect(screen.getByText('New Session')).toBeDefined();
    expect(screen.getByText('Ctrl+Shift+N')).toBeDefined();
  });

  it('renders a separator when item.divider is true', () => {
    const { container } = render(
      <WorkbenchItemRow
        item={DIVIDER}
        onClose={vi.fn()}
        isHighlighted={false}
        onMouseEnterItem={vi.fn()}
        itemRef={() => {}}
      />,
    );
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('fires action then close when clicked', () => {
    const action = vi.fn();
    const onClose = vi.fn();
    render(
      <WorkbenchItemRow
        item={{ label: 'Run', action }}
        onClose={onClose}
        isHighlighted={false}
        onMouseEnterItem={vi.fn()}
        itemRef={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Run'));
    expect(action).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('WorkbenchDropdown', () => {
  it('renders all non-divider items via portal with role="menu"', () => {
    const ref = React.createRef<HTMLDivElement>();
    const itemRefs = { current: [] as (HTMLButtonElement | null)[] };
    render(
      <WorkbenchDropdown
        menu={MENU}
        onClose={vi.fn()}
        highlightedIndex={-1}
        onHighlight={vi.fn()}
        itemRefs={itemRefs}
        anchorRect={null}
        dropdownRef={ref}
      />,
    );
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByText('New Session')).toBeDefined();
    expect(screen.getByText('Exit')).toBeDefined();
  });
});

describe('WorkbenchMenuButton', () => {
  it('renders label and aria-expanded reflects isOpen', () => {
    const { rerender } = render(
      <WorkbenchMenuButton label="File" isOpen={false} onClick={vi.fn()} onHover={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'File' }).getAttribute('aria-expanded')).toBe('false');
    rerender(
      <WorkbenchMenuButton label="File" isOpen={true} onClick={vi.fn()} onHover={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'File' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('fires onClick and onHover', () => {
    const onClick = vi.fn();
    const onHover = vi.fn();
    render(<WorkbenchMenuButton label="Edit" isOpen={false} onClick={onClick} onHover={onHover} />);
    const btn = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(btn);
    fireEvent.mouseEnter(btn);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onHover).toHaveBeenCalledOnce();
  });
});
