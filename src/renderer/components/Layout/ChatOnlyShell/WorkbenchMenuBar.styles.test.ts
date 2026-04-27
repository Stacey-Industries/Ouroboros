/**
 * WorkbenchMenuBar.styles — smoke tests (Wave 59 Phase C).
 */
import { describe, expect, it } from 'vitest';

import {
  ALT_KEY_MAP,
  dropdownStyle,
  menuButtonStyle,
  menuItemRowStyle,
  separatorStyle,
} from './WorkbenchMenuBar.styles';

describe('WorkbenchMenuBar.styles', () => {
  it('ALT_KEY_MAP covers exactly the five workbench menus', () => {
    expect(Object.keys(ALT_KEY_MAP).sort()).toEqual(['e', 'f', 'h', 't', 'v']);
    expect(ALT_KEY_MAP.f).toBe(0);
    expect(ALT_KEY_MAP.h).toBe(4);
  });

  it('dropdownStyle uses tokens for the shadow + carries no-drag region marker', () => {
    expect(dropdownStyle.zIndex).toBe(1000);
    expect((dropdownStyle as Record<string, unknown>).WebkitAppRegion).toBe('no-drag');
  });

  it('separatorStyle uses the border-semantic token', () => {
    expect(separatorStyle.backgroundColor).toBe('var(--border-semantic)');
  });

  it('menu item + button styles use the ui font token', () => {
    expect(menuItemRowStyle.fontFamily).toBe('var(--font-ui, sans-serif)');
    expect(menuButtonStyle.fontFamily).toBe('var(--font-ui, sans-serif)');
  });
});
