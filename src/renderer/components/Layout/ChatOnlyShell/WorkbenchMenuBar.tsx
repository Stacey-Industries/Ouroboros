/**
 * WorkbenchMenuBar — workbench-specific top menu bar (Wave 59 Phase C).
 *
 * Renders File / Edit / View / Tools / Help menus below the window-controls
 * row in the workbench title bar. Keyboard shortcuts: Alt+F/E/V/T/H open the
 * corresponding menu; Arrow keys navigate; Escape closes; Enter activates.
 *
 * Self-contained: does NOT import from TitleBar.navbar to avoid pulling in
 * useImmersiveChatFlag and its electron-config side-effects in jsdom tests.
 *
 * Implementation is split across:
 *   - WorkbenchMenuBar.styles.ts — style constants + ALT_KEY_MAP
 *   - WorkbenchMenuBar.parts.tsx — sub-components (item row, dropdown, button)
 *   - WorkbenchMenuBar.state.ts  — keyboard handlers + state hook
 */

import React from 'react';

import { getWorkbenchMenuDefinitions } from '../TitleBar.menus';
import { WorkbenchDropdown, WorkbenchMenuButton } from './WorkbenchMenuBar.parts';
import { useWorkbenchMenuBarState } from './WorkbenchMenuBar.state';

export function WorkbenchMenuBar(): React.ReactElement {
  const menus = getWorkbenchMenuDefinitions();
  const s = useWorkbenchMenuBarState(menus);
  return (
    <div
      ref={s.containerRef}
      className="titlebar-no-drag flex items-stretch"
      style={{ height: '28px' }}
      data-testid="workbench-menu-bar"
    >
      {menus.map((menu, idx) => (
        <div key={menu.label}>
          <WorkbenchMenuButton
            label={menu.label}
            isOpen={s.openIdx === idx}
            onClick={() => s.handleClick(idx)}
            onHover={() => s.handleHover(idx)}
            buttonRef={(el: HTMLButtonElement | null) => {
              s.buttonRefs.current[idx] = el;
            }}
          />
          {s.openIdx === idx && (
            <WorkbenchDropdown
              menu={menu}
              onClose={s.closeMenu}
              highlightedIndex={s.highlighted}
              onHighlight={s.setHighlighted}
              itemRefs={s.itemRefs}
              anchorRect={s.anchorRect}
              dropdownRef={s.dropdownRef}
            />
          )}
        </div>
      ))}
    </div>
  );
}
