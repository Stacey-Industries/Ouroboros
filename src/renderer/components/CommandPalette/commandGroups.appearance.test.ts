/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { materialVariantCommands, themeCommands } from './commandGroups.appearance';

describe('materialVariantCommands', () => {
  it('returns a submenu with vapor / prism / warp children', () => {
    const cmd = materialVariantCommands();
    expect(cmd.id).toBe('material');
    expect(cmd.children?.map((c) => c.id)).toEqual([
      'material:vapor',
      'material:prism',
      'material:warp',
    ]);
  });

  it('each child dispatches agent-ide:set-material-variant with the variant id', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cmd = materialVariantCommands();
    beforeEach(() => dispatchSpy.mockClear());

    for (const child of cmd.children ?? []) {
      dispatchSpy.mockClear();
      child.action();
      const event = dispatchSpy.mock.calls.at(-1)?.[0] as CustomEvent<string>;
      expect(event.type).toBe('agent-ide:set-material-variant');
      expect(['vapor', 'prism', 'warp']).toContain(event.detail);
    }
  });
});

describe('themeCommands', () => {
  it('returns a submenu with all five built-in theme children', () => {
    const cmd = themeCommands();
    expect(cmd.id).toBe('theme');
    expect(cmd.children?.map((c) => c.id).sort()).toEqual([
      'theme:cursor',
      'theme:kiro',
      'theme:modern',
      'theme:retro',
      'theme:warp',
    ]);
  });

  it('each child dispatches agent-ide:set-theme with the theme id', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cmd = themeCommands();
    for (const child of cmd.children ?? []) {
      dispatchSpy.mockClear();
      child.action();
      const event = dispatchSpy.mock.calls.at(-1)?.[0] as CustomEvent<string>;
      expect(event.type).toBe('agent-ide:set-theme');
      expect(event.detail).toBe(child.id.replace('theme:', ''));
    }
  });
});
